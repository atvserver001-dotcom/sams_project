'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  JUMP_ROPE_DEVICE_READY_TIMEOUT_MS,
  JUMP_ROPE_GATEWAY_HANDSHAKE_TIMEOUT_MS,
  JUMP_ROPE_GATEWAY_LEASE_MS,
  JUMP_ROPE_PROFILE,
  JUMP_ROPE_SERIAL_BAUD_RATE,
  JumpRopeCachedIdentity,
  JumpRopeDeviceReadyEvent,
  JumpRopeGatewayCaps,
  JumpRopeGatewayMessage,
  JumpRopeMode,
  JumpRopeNdjsonMessageDecoder,
  JumpRopeSnapshotEvent,
  isExpectedJumpRopeAck,
  isExpectedJumpRopeGatewayIdentity,
  isExpectedJumpRopeStatus,
  isJumpRopeEventForRun,
  jumpRopeModeSetFields,
  normalizeJumpRopeTarget,
  parseJumpRopeDeviceReady,
  parseJumpRopeSnapshot,
} from '../../lib/jumpRopeSerial'
import { OperationGeneration } from '../../lib/operationGeneration'
import { disposeOwnedResource } from '../../lib/ownedResource'

export type WebSerialJumpRopeState =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'configuring'
  | 'running'
  | 'stopping'
  | 'error'

export interface JumpRopeStartConfig {
  mode: JumpRopeMode
  target: number
}

export interface WebSerialJumpRopeRun {
  bootId: string
  gatewayId: string
  runId: string
  generation: number
  startedAt: number
  device: JumpRopeDeviceReadyEvent
  mode: JumpRopeMode
  target: number
}

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
}

interface SerialConnectionEventLike extends Event {
  port?: SerialPortLike
}

interface SerialApiLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>
  addEventListener?(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
  removeEventListener?(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
}

interface PendingRequest {
  matches(message: JumpRopeGatewayMessage): boolean
  resolve(message: JumpRopeGatewayMessage): void
  reject(error: Error): void
  timeoutId: ReturnType<typeof setTimeout>
}

interface DeviceReadyWaiter {
  matches(event: JumpRopeDeviceReadyEvent): boolean
  resolve(event: JumpRopeDeviceReadyEvent): void
  reject(error: Error): void
  timeoutId: ReturnType<typeof setTimeout>
}

interface JumpRopeSessionStatus {
  state: WebSerialJumpRopeState
  statusText: string
  error: string | null
  run: WebSerialJumpRopeRun | null
}

type ConnectionFailureKind = 'cancelled' | 'permission' | 'busy' | 'wrong-device' | 'disconnected' | 'transient'

class ConnectionFailure extends Error {
  constructor(
    readonly kind: ConnectionFailureKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ConnectionFailure'
  }
}

class GatewayCommandFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs: number,
  ) {
    super(message)
    this.name = 'GatewayCommandFailure'
  }
}

class GatewayRequestTimeout extends Error {
  constructor(readonly command: string) {
    super(`${command} 응답 시간이 초과되었습니다.`)
    this.name = 'GatewayRequestTimeout'
  }
}

interface WebSerialJumpRopeTiming {
  handshakeTimeoutMs: number
  deviceReadyTimeoutMs: number
  requestTimeoutMs: number
  runStartTimeoutMs: number
  retryDelayMs: number
  openRetryDelayMs: number
  pingIntervalMs: number
  pingTimeoutMs: number
}

const DEFAULT_TIMING: WebSerialJumpRopeTiming = {
  handshakeTimeoutMs: JUMP_ROPE_GATEWAY_HANDSHAKE_TIMEOUT_MS,
  deviceReadyTimeoutMs: JUMP_ROPE_DEVICE_READY_TIMEOUT_MS,
  requestTimeoutMs: 1_000,
  runStartTimeoutMs: 2_000,
  retryDelayMs: 120,
  openRetryDelayMs: 120,
  pingIntervalMs: 1_000,
  pingTimeoutMs: 800,
}

const CP210X_FILTER: SerialPortInfo = { usbVendorId: 0x10c4, usbProductId: 0xea60 }
const IDENTITY_STORAGE_KEY = 'atv.jump-rope.jr203.identity.v1'

const isCp210xPort = (port: SerialPortLike) => {
  const info = port.getInfo()
  return info.usbVendorId === CP210X_FILTER.usbVendorId &&
    info.usbProductId === CP210X_FILTER.usbProductId
}

const isSerialPortLike = (value: unknown): value is SerialPortLike => (
  typeof value === 'object' && value !== null &&
  'getInfo' in value && typeof value.getInfo === 'function'
)

const delay = (durationMs: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, durationMs)
})

const classifyConnectionFailure = (error: unknown): ConnectionFailure => {
  if (error instanceof ConnectionFailure) return error
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') {
      return new ConnectionFailure('cancelled', 'USB 포트 선택이 취소되었습니다.', { cause: error })
    }
    if (error.name === 'SecurityError') {
      return new ConnectionFailure('permission', 'USB 포트 사용 권한을 확인해 주세요.', { cause: error })
    }
    if (error.name === 'InvalidStateError' || error.name === 'NetworkError') {
      return new ConnectionFailure('busy', 'USB 포트를 다른 창이나 프로그램에서 사용 중입니다.', { cause: error })
    }
  }
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase()
    if (normalized.includes('disconnected') || normalized.includes('device has been lost')) {
      return new ConnectionFailure('disconnected', 'USB 줄넘기 게이트웨이 연결이 끊어졌습니다.', { cause: error })
    }
    return new ConnectionFailure('transient', error.message, { cause: error })
  }
  return new ConnectionFailure('transient', String(error))
}

const isCachedIdentity = (value: unknown): value is JumpRopeCachedIdentity => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const identity = value as Record<string, unknown>
  return typeof identity.gateway_id === 'string' && identity.gateway_id.length > 0 &&
    typeof identity.address === 'string' && identity.address.length > 0 &&
    typeof identity.address_type === 'number' && Number.isInteger(identity.address_type) &&
    identity.address_type >= 0 && identity.address_type <= 3 &&
    typeof identity.name === 'string'
}

/** Exported for deterministic protocol tests; application code should use the hook below. */
export class WebSerialJumpRopeClient {
  private readonly lifecycle = new OperationGeneration()
  private readonly decoder = new JumpRopeNdjsonMessageDecoder()
  private readonly textDecoder = new TextDecoder()
  private readonly textEncoder = new TextEncoder()
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly deviceReadyWaiters = new Set<DeviceReadyWaiter>()
  private readonly timing: WebSerialJumpRopeTiming
  private port: SerialPortLike | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private readerLoop: Promise<void> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private requestSequence = 0
  private bootId = ''
  private gatewayId = ''
  private runId = ''
  private runGeneration = 0
  private lastSequence = 0
  private bufferedDeviceReadyEvents: JumpRopeDeviceReadyEvent[] = []
  private bufferedSnapshots: JumpRopeSnapshotEvent[] = []
  private missedPongs = 0
  private pingBusy = false
  private pingAttempt = 0
  private closing = false
  private forcePickerNext = false
  private authorizedPorts: SerialPortLike[] = []
  private serialWithListeners: SerialApiLike | null = null
  private state: WebSerialJumpRopeState = 'idle'
  private run: WebSerialJumpRopeRun | null = null
  private activeConfig: JumpRopeStartConfig | null = null
  private deviceSessionStarted = false
  private startPromise: Promise<WebSerialJumpRopeRun | null> | null = null
  private stopPromise: Promise<void> | null = null
  private disposePromise: Promise<void> | null = null
  private closePromise: Promise<void> | null = null

  private readonly onSerialConnect = (event: Event) => {
    const connectionEvent = event as SerialConnectionEventLike
    const port = connectionEvent.port ?? (isSerialPortLike(event.target) ? event.target : null)
    if (!port || !isCp210xPort(port) || this.authorizedPorts.includes(port)) return
    this.authorizedPorts = [...this.authorizedPorts, port]
  }

  private readonly onSerialDisconnect = (event: Event) => {
    const connectionEvent = event as SerialConnectionEventLike
    const port = connectionEvent.port ?? (isSerialPortLike(event.target) ? event.target : null)
    if (!port) return
    this.authorizedPorts = this.authorizedPorts.filter((candidate) => candidate !== port)
    if (this.port === port) {
      this.forcePickerNext = true
      void this.failSession('USB 줄넘기 게이트웨이 연결이 끊어졌습니다.')
    }
  }

  constructor(
    private readonly onSnapshot: (event: JumpRopeSnapshotEvent, receivedAt: number) => void,
    private readonly onStatus: (status: JumpRopeSessionStatus) => void,
    timing: Partial<WebSerialJumpRopeTiming> = {},
  ) {
    this.timing = { ...DEFAULT_TIMING, ...timing }
  }

  async preloadAuthorizedPorts() {
    const operation = this.lifecycle.capture()
    try {
      const serial = this.getSerialApi()
      this.installSerialListeners(serial)
      const ports = await serial.getPorts()
      if (!this.lifecycle.isCurrent(operation)) return
      this.authorizedPorts = ports.filter(isCp210xPort)
    } catch {
      if (this.lifecycle.isCurrent(operation)) this.authorizedPorts = []
    }
  }

  start(config: JumpRopeStartConfig) {
    if (this.lifecycle.isDisposed()) return Promise.resolve(null)
    if (this.startPromise) return this.startPromise
    if (this.state === 'running') return Promise.resolve(this.run)
    if (this.state === 'stopping') return Promise.resolve(null)

    const normalizedConfig = {
      mode: config.mode,
      target: normalizeJumpRopeTarget(config.mode, config.target),
    }
    const operation = this.lifecycle.begin()
    this.resetRunState()
    this.activeConfig = normalizedConfig
    this.notify('connecting', 'USB 줄넘기 게이트웨이를 찾는 중입니다.', null, null)

    const promise = this.performStart(operation, normalizedConfig).finally(() => {
      if (this.startPromise === promise) this.startPromise = null
    })
    this.startPromise = promise
    return promise
  }

  private async performStart(operation: number, config: JumpRopeStartConfig) {
    try {
      const serial = this.getSerialApi()
      this.installSerialListeners(serial)
      let ports: SerialPortLike[]

      if (this.forcePickerNext) {
        const selected = await serial.requestPort({ filters: [CP210X_FILTER] })
        this.assertCurrent(operation)
        ports = [selected]
        this.addAuthorizedPort(selected)
        this.forcePickerNext = false
      } else {
        // requestPort 앞에 다른 비동기 작업을 두지 않아 클릭의 사용자 활성 권한을 보존한다.
        ports = this.authorizedPorts
        if (ports.length === 0) {
          const selected = await serial.requestPort({ filters: [CP210X_FILTER] })
          this.assertCurrent(operation)
          ports = [selected]
          this.addAuthorizedPort(selected)
        }
      }

      let lastFailure: ConnectionFailure | null = null
      for (const port of ports) {
        this.assertCurrent(operation)
        try {
          return await this.connectPort(port, operation, config, true)
        } catch (error) {
          lastFailure = classifyConnectionFailure(error)
          if (lastFailure.kind === 'disconnected') this.removeAuthorizedPort(port)
          await this.bestEffortStopRun()
          await this.closeTransport()
          if (!this.lifecycle.isCurrent(operation)) return null
        }
      }

      const failure = lastFailure ?? new ConnectionFailure(
        'transient',
        '사용 가능한 USB 줄넘기 게이트웨이를 찾지 못했습니다.',
      )
      this.forcePickerNext = failure.kind === 'wrong-device' || failure.kind === 'disconnected'
      throw failure
    } catch (error) {
      const failure = classifyConnectionFailure(error)
      await this.bestEffortStopRun()
      await this.closeTransport()
      if (!this.lifecycle.isCurrent(operation)) return null
      const suffix = this.forcePickerNext ? ' 다시 시작하면 USB 포트를 다시 선택할 수 있습니다.' : ''
      this.notify('error', 'USB 연결 실패', `${failure.message}${suffix}`, null)
      return null
    }
  }

  private async connectPort(
    port: SerialPortLike,
    operation: number,
    config: JumpRopeStartConfig,
    retryPortOpen: boolean,
  ) {
    this.port = port
    this.closing = false
    this.decoder.reset()

    try {
      await this.openPort(port, operation, retryPortOpen)
      this.assertCurrent(operation)
      if (!port.readable || !port.writable) {
        throw new ConnectionFailure('disconnected', 'USB 포트의 읽기/쓰기 스트림을 열 수 없습니다.')
      }

      this.reader = port.readable.getReader()
      this.writer = port.writable.getWriter()
      this.readerLoop = this.readMessages()
      this.notify('handshaking', 'ATV JR203 게이트웨이와 핸드셰이크 중입니다.', null, null)

      const deadline = Date.now() + this.timing.handshakeTimeoutMs
      const initialCaps = await this.waitForGatewayCaps(deadline, operation)
      const readyCaps = await this.releasePreviousRun(initialCaps, deadline, operation)
      this.bootId = readyCaps.boot_id
      this.gatewayId = readyCaps.gateway_id

      const cachedIdentity = this.loadCachedIdentity(this.gatewayId)
      let device: JumpRopeDeviceReadyEvent
      try {
        device = await this.startConfiguredRun(operation, cachedIdentity)
      } catch (error) {
        const cachedDeviceTimedOut = cachedIdentity !== null &&
          error instanceof GatewayRequestTimeout &&
          error.command === 'device_ready'
        if (!cachedDeviceTimedOut) throw error

        this.notify(
          'configuring',
          '저장된 JR203을 찾지 못해 주변 장치를 한 번 다시 탐색합니다.',
          null,
          null,
        )
        await this.stopCurrentRun()
        this.clearCachedIdentity(this.gatewayId)
        this.assertCurrent(operation)
        device = await this.startConfiguredRun(operation, null)
      }
      if (!device.identity_verified) {
        const discoveredIdentity: JumpRopeCachedIdentity = {
          gateway_id: this.gatewayId,
          address: device.address,
          address_type: device.address_type,
          name: device.name,
        }
        this.saveCachedIdentity(discoveredIdentity)
        this.notify('configuring', 'JR203 신원을 고정하고 한 번 다시 연결하는 중입니다.', null, null)
        await this.stopCurrentRun()
        this.assertCurrent(operation)
        device = await this.startConfiguredRun(operation, discoveredIdentity)
        if (!device.identity_verified) {
          throw new ConnectionFailure('wrong-device', 'JR203 장치 신원을 확인하지 못했습니다.')
        }
      }
      this.saveCachedIdentity({
        gateway_id: this.gatewayId,
        address: device.address,
        address_type: device.address_type,
        name: device.name,
      })

      this.notify('configuring', 'JR203 시각과 측정 모드를 설정하는 중입니다.', null, null)
      await this.sendControl('time_sync', { timestamp_s: Math.floor(Date.now() / 1_000) })
      this.assertCurrent(operation)
      if (config.mode !== 3) {
        await this.sendControl('mode_set', jumpRopeModeSetFields(config.mode, config.target))
        this.assertCurrent(operation)
      }
      await this.sendControl('session_start', { mode: config.mode, target: config.target })
      this.assertCurrent(operation)
      this.deviceSessionStarted = true

      const metadata: WebSerialJumpRopeRun = {
        bootId: this.bootId,
        gatewayId: this.gatewayId,
        runId: this.runId,
        generation: this.runGeneration,
        startedAt: Date.now(),
        device,
        mode: config.mode,
        target: config.target,
      }
      this.run = metadata
      this.notify('running', 'USB 게이트웨이 연결됨 · JR203 줄넘기 측정 중', null, metadata)
      this.flushBufferedSnapshots()
      return metadata
    } catch (error) {
      if (!this.lifecycle.isCurrent(operation)) {
        await this.closeTransport()
        try { await port.close() } catch { }
      }
      throw error
    }
  }

  private async openPort(port: SerialPortLike, operation: number, retryPortOpen: boolean) {
    const maximumAttempts = retryPortOpen ? 2 : 1
    let lastFailure: ConnectionFailure | null = null
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      this.assertCurrent(operation)
      try {
        await port.open({ baudRate: JUMP_ROPE_SERIAL_BAUD_RATE })
        this.assertCurrent(operation)
        return
      } catch (error) {
        lastFailure = classifyConnectionFailure(error)
        const retryable = lastFailure.kind === 'busy' || lastFailure.kind === 'transient'
        if (!retryable || attempt === maximumAttempts) break
        try { await port.close() } catch { }
        this.assertCurrent(operation)
        await delay(this.timing.openRetryDelayMs)
      }
    }
    throw lastFailure ?? new ConnectionFailure('transient', 'USB 포트를 열지 못했습니다.')
  }

  private async waitForGatewayCaps(deadline: number, operation: number): Promise<JumpRopeGatewayCaps> {
    while (Date.now() < deadline) {
      this.assertCurrent(operation)
      try {
        const caps = await this.sendRequest(
          'hello',
          {},
          (message) => message.kind === 'caps',
          this.requestTimeoutWithin(deadline),
        )
        this.assertCurrent(operation)
        if (!isExpectedJumpRopeGatewayIdentity(caps)) {
          throw new ConnectionFailure('wrong-device', '선택한 포트가 ATV JR203 게이트웨이가 아닙니다.')
        }
        return caps
      } catch (error) {
        if (error instanceof ConnectionFailure) throw error
        if (error instanceof GatewayCommandFailure) {
          if (error.code !== 'disconnect_pending' || !error.retryable) throw error
          const retryDelay = Math.min(
            Math.max(250, error.retryAfterMs),
            Math.max(0, deadline - Date.now()),
          )
          if (retryDelay > 0) await delay(retryDelay)
          continue
        }
        if (!(error instanceof GatewayRequestTimeout)) throw error
        const retryDelay = Math.min(this.timing.retryDelayMs, Math.max(0, deadline - Date.now()))
        if (retryDelay > 0) await delay(retryDelay)
      }
    }
    throw new ConnectionFailure('transient', 'ATV JR203 게이트웨이 준비 시간이 초과되었습니다.')
  }

  private async releasePreviousRun(
    initialCaps: JumpRopeGatewayCaps,
    deadline: number,
    operation: number,
  ): Promise<JumpRopeGatewayCaps> {
    let caps = initialCaps
    while (caps.state !== 'ready') {
      this.notify('handshaking', '이전 JR203 측정 세션을 정리하는 중입니다.', null, null)
      if (caps.state === 'stopping') {
        if (Date.now() >= deadline) {
          throw new ConnectionFailure('transient', '이전 JR203 연결 정리 시간이 초과되었습니다.')
        }
        await delay(Math.min(250, Math.max(1, deadline - Date.now())))
        caps = await this.waitForGatewayCaps(deadline, operation)
        continue
      }
      const status = await this.sendRequest(
        'status',
        {},
        (message) => message.kind === 'status',
        this.requestTimeoutWithin(deadline),
      )
      this.assertCurrent(operation)
      if (!isExpectedJumpRopeStatus(status, { bootId: caps.boot_id })) {
        throw new ConnectionFailure('wrong-device', 'JR203 게이트웨이 상태 응답이 올바르지 않습니다.')
      }
      if (status.state === 'running' && status.run_id) {
        await this.requestRunStop(status.run_id, status.generation, caps.boot_id)
      }
      caps = await this.waitForGatewayCaps(deadline, operation)
    }
    return caps
  }

  private async startConfiguredRun(
    operation: number,
    identity: JumpRopeCachedIdentity | null,
  ): Promise<JumpRopeDeviceReadyEvent> {
    const identityFields = identity
      ? { address: identity.address, address_type: identity.address_type }
      : {}
    await this.sendRequest(
      'profile_set',
      {
        slot: JUMP_ROPE_PROFILE.slot,
        handle: JUMP_ROPE_PROFILE.handle,
        name_prefix: JUMP_ROPE_PROFILE.namePrefix,
        driver: JUMP_ROPE_PROFILE.driver,
        wire_dialect: JUMP_ROPE_PROFILE.wireDialect,
        write_mode: JUMP_ROPE_PROFILE.writeMode,
        ...identityFields,
      },
      (message) => isExpectedJumpRopeAck(message, 'profile_set', { bootId: this.bootId }),
      1_500,
    )
    this.assertCurrent(operation)

    this.runId = this.createToken('run')
    this.runGeneration = 0
    this.lastSequence = 0
    this.bufferedDeviceReadyEvents = []
    this.bufferedSnapshots = []
    const currentRunId = this.runId
    let ack: JumpRopeGatewayMessage | null = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        ack = await this.sendRequest(
          'run_start',
          { run_id: currentRunId, lease_ms: JUMP_ROPE_GATEWAY_LEASE_MS },
          (message) => isExpectedJumpRopeAck(message, 'run_start', {
            bootId: this.bootId,
            runId: currentRunId,
          }),
          this.timing.runStartTimeoutMs,
        )
        break
      } catch (error) {
        if (!(error instanceof GatewayRequestTimeout) || attempt > 0) throw error
      }
    }
    this.assertCurrent(operation)
    if (
      !ack ||
      ack.state !== 'running' ||
      typeof ack.generation !== 'number' ||
      !Number.isInteger(ack.generation) ||
      ack.generation <= 0 ||
      typeof ack.lease_remaining_ms !== 'number' ||
      ack.lease_remaining_ms <= 0 ||
      ack.lease_remaining_ms > JUMP_ROPE_GATEWAY_LEASE_MS
    ) {
      throw new ConnectionFailure('transient', 'JR203 측정 세션 시작 응답이 올바르지 않습니다.')
    }
    this.runGeneration = ack.generation
    this.notify('configuring', 'JR203 줄넘기를 탐색하고 GATT로 연결하는 중입니다.', null, null)
    // 5초 lease는 BLE 탐색/연결 중에도 소진되므로 run_start ACK 직후부터 유지한다.
    this.startPingTimer()
    return this.waitForDeviceReady(operation)
  }

  private waitForDeviceReady(operation: number): Promise<JumpRopeDeviceReadyEvent> {
    const matches = (event: JumpRopeDeviceReadyEvent) => (
      event.boot_id === this.bootId &&
      event.run_id === this.runId &&
      event.generation === this.runGeneration &&
      event.slot === JUMP_ROPE_PROFILE.slot
    )
    const bufferedIndex = this.bufferedDeviceReadyEvents.findIndex(matches)
    if (bufferedIndex >= 0) {
      const [event] = this.bufferedDeviceReadyEvents.splice(bufferedIndex, 1)
      return Promise.resolve(event)
    }

    return new Promise<JumpRopeDeviceReadyEvent>((resolve, reject) => {
      const waiter: DeviceReadyWaiter = {
        matches,
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          this.deviceReadyWaiters.delete(waiter)
          reject(new GatewayRequestTimeout('device_ready'))
        }, this.timing.deviceReadyTimeoutMs),
      }
      this.deviceReadyWaiters.add(waiter)
      if (!this.lifecycle.isCurrent(operation)) {
        clearTimeout(waiter.timeoutId)
        this.deviceReadyWaiters.delete(waiter)
        reject(new ConnectionFailure('transient', 'USB 연결 작업이 취소되었습니다.'))
      }
    })
  }

  private sendControl(op: 'time_sync' | 'mode_set' | 'session_start' | 'session_stop', fields: Record<string, unknown>) {
    return this.sendRequest(
      'control',
      { op, run_id: this.runId, generation: this.runGeneration, ...fields },
      (message) => isExpectedJumpRopeAck(message, op, {
        bootId: this.bootId,
        runId: this.runId,
        generation: this.runGeneration,
      }),
      1_500,
    )
  }

  stop() {
    if (this.lifecycle.isDisposed()) return this.disposePromise ?? Promise.resolve()
    if (this.stopPromise) return this.stopPromise
    if (this.state === 'idle') return Promise.resolve()

    const operation = this.lifecycle.begin()
    this.notify('stopping', 'JR203 측정을 안전하게 종료하는 중입니다.', null, this.run)
    this.clearPingTimer()
    const promise = this.performStop(operation).finally(() => {
      if (this.stopPromise === promise) this.stopPromise = null
    })
    this.stopPromise = promise
    return promise
  }

  private async performStop(operation: number) {
    try {
      await this.bestEffortStopRun()
    } finally {
      await this.closeTransport()
      if (this.lifecycle.isCurrent(operation)) {
        this.activeConfig = null
        this.notify('idle', '줄넘기 측정이 종료되었습니다.', null, null)
      }
    }
  }

  private async bestEffortStopRun() {
    if (!this.writer || !this.runId) return
    const config = this.activeConfig
    if (this.deviceSessionStarted && config) {
      try {
        await this.sendControl('session_stop', { mode: config.mode, target: config.target })
      } catch { }
      this.deviceSessionStarted = false
    }
    try { await this.stopCurrentRun() } catch { }
  }

  private async stopCurrentRun() {
    const currentRunId = this.runId
    const currentGeneration = this.runGeneration
    if (!this.writer || !currentRunId) return
    this.clearPingTimer()
    await this.requestRunStop(currentRunId, currentGeneration, this.bootId)
    this.runId = ''
    this.runGeneration = 0
    this.lastSequence = 0
    this.run = null
    this.bufferedDeviceReadyEvents = []
    this.bufferedSnapshots = []
  }

  private async requestRunStop(runId: string, generation: number, bootId: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.sendRequest(
          'run_stop',
          { run_id: runId, generation },
          (message) => isExpectedJumpRopeAck(message, 'run_stop', {
            bootId,
            runId,
            generation,
          }) &&
            message.state === 'ready' &&
            message.running === false &&
            message.connected === false,
          3_500,
        )
        return
      } catch (error) {
        const canRetry = error instanceof GatewayCommandFailure &&
          error.code === 'disconnect_pending' &&
          error.retryable &&
          attempt === 0
        if (!canRetry) throw error
        await delay(Math.max(250, error.retryAfterMs))
      }
    }
  }

  dispose() {
    if (this.disposePromise) return this.disposePromise
    const activeStart = this.startPromise
    const activeStop = this.stopPromise
    this.lifecycle.dispose()
    this.removeSerialListeners()
    this.clearPingTimer()
    const promise = (async () => {
      if (activeStop) {
        try { await activeStop } catch { }
      } else {
        try { await this.bestEffortStopRun() } catch { }
      }
      await this.closeTransport()
      if (activeStart) {
        try { await activeStart } catch { }
        await this.closeTransport()
      }
    })()
    this.disposePromise = promise
    return promise
  }

  private getSerialApi() {
    if (!window.isSecureContext) {
      throw new ConnectionFailure('permission', 'USB 연결은 HTTPS 또는 localhost에서만 사용할 수 있습니다.')
    }
    const serial = (navigator as Navigator & { serial?: SerialApiLike }).serial
    if (!serial) {
      throw new ConnectionFailure(
        'permission',
        '이 브라우저는 Web Serial을 지원하지 않습니다. Windows용 Chrome 또는 Edge를 사용해 주세요.',
      )
    }
    return serial
  }

  private installSerialListeners(serial: SerialApiLike) {
    if (this.serialWithListeners === serial) return
    this.removeSerialListeners()
    serial.addEventListener?.('connect', this.onSerialConnect)
    serial.addEventListener?.('disconnect', this.onSerialDisconnect)
    this.serialWithListeners = serial
  }

  private removeSerialListeners() {
    this.serialWithListeners?.removeEventListener?.('connect', this.onSerialConnect)
    this.serialWithListeners?.removeEventListener?.('disconnect', this.onSerialDisconnect)
    this.serialWithListeners = null
  }

  private addAuthorizedPort(port: SerialPortLike) {
    if (isCp210xPort(port) && !this.authorizedPorts.includes(port)) {
      this.authorizedPorts = [...this.authorizedPorts, port]
    }
  }

  private removeAuthorizedPort(port: SerialPortLike) {
    this.authorizedPorts = this.authorizedPorts.filter((candidate) => candidate !== port)
  }

  private async readMessages() {
    const reader = this.reader
    if (!reader) return
    try {
      while (!this.closing) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        const text = this.textDecoder.decode(value, { stream: true })
        for (const message of this.decoder.push(text)) this.handleMessage(message)
      }
      if (!this.closing) {
        this.forcePickerNext = true
        if (this.port) this.removeAuthorizedPort(this.port)
        void this.failSession('USB 줄넘기 게이트웨이 연결이 종료되었습니다.')
      }
    } catch (error) {
      if (!this.closing) {
        this.forcePickerNext = true
        if (this.port) this.removeAuthorizedPort(this.port)
        const failure = classifyConnectionFailure(error)
        void this.failSession(`USB 데이터 수신 오류: ${failure.message}`)
      }
    } finally {
      if (this.reader === reader) this.reader = null
      reader.releaseLock()
    }
  }

  private handleMessage(message: JumpRopeGatewayMessage) {
    if (message.request_id) {
      const pending = this.pendingRequests.get(message.request_id)
      if (pending) {
        if (message.kind === 'error') {
          clearTimeout(pending.timeoutId)
          this.pendingRequests.delete(message.request_id)
          pending.reject(new GatewayCommandFailure(
            message.code || 'device_error',
            message.message || message.code || '장치 명령 처리 오류',
            message.retryable === true,
            typeof message.retry_after_ms === 'number' && Number.isFinite(message.retry_after_ms)
              ? Math.max(0, Math.trunc(message.retry_after_ms))
              : 0,
          ))
        } else if (pending.matches(message)) {
          clearTimeout(pending.timeoutId)
          this.pendingRequests.delete(message.request_id)
          pending.resolve(message)
        }
      }
    }
    if (this.lifecycle.isDisposed()) return

    if (message.kind === 'status' && message.reason === 'lease_expired' && this.state === 'running') {
      void this.failSession('USB 게이트웨이와의 연결 유지 신호가 끊겼습니다.')
      return
    }

    const ready = parseJumpRopeDeviceReady(message)
    if (ready) {
      const waiter = [...this.deviceReadyWaiters].find((candidate) => candidate.matches(ready))
      if (waiter) {
        clearTimeout(waiter.timeoutId)
        this.deviceReadyWaiters.delete(waiter)
        waiter.resolve(ready)
      } else {
        this.bufferedDeviceReadyEvents.push(ready)
        this.bufferedDeviceReadyEvents = this.bufferedDeviceReadyEvents.slice(-4)
      }
      return
    }

    const snapshot = parseJumpRopeSnapshot(message)
    if (!snapshot) return
    if (this.state === 'handshaking' || this.state === 'configuring') {
      this.bufferedSnapshots.push(snapshot)
      this.bufferedSnapshots = this.bufferedSnapshots.slice(-32)
      return
    }
    if (this.state === 'running') this.acceptSnapshot(snapshot, Date.now())
  }

  private flushBufferedSnapshots() {
    const snapshots = this.bufferedSnapshots
      .filter((event) => (
        event.boot_id === this.bootId &&
        event.run_id === this.runId &&
        event.generation === this.runGeneration
      ))
      .sort((left, right) => left.seq - right.seq)
    this.bufferedSnapshots = []
    for (const snapshot of snapshots) this.acceptSnapshot(snapshot, Date.now())
  }

  private acceptSnapshot(event: JumpRopeSnapshotEvent, receivedAt: number) {
    if (!isJumpRopeEventForRun(event, {
      bootId: this.bootId,
      runId: this.runId,
      generation: this.runGeneration,
      lastSequence: this.lastSequence,
    })) return
    this.lastSequence = event.seq
    this.onSnapshot(event, receivedAt)
  }

  private sendRequest(
    kind: string,
    fields: Record<string, unknown>,
    matches: (message: JumpRopeGatewayMessage) => boolean,
    timeoutMs: number,
  ) {
    const requestId = this.createToken('req')
    const writer = this.writer
    if (!writer) return Promise.reject(new ConnectionFailure('disconnected', 'USB 쓰기 스트림이 열려 있지 않습니다.'))

    return new Promise<JumpRopeGatewayMessage>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new GatewayRequestTimeout(kind))
      }, timeoutMs)
      this.pendingRequests.set(requestId, { matches, resolve, reject, timeoutId })
      const payload = `${JSON.stringify({ v: 1, kind, request_id: requestId, ...fields })}\n`
      writer.write(this.textEncoder.encode(payload)).catch((error) => {
        clearTimeout(timeoutId)
        this.pendingRequests.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  private startPingTimer() {
    this.clearPingTimer()
    this.pingTimer = setInterval(() => { void this.exchangePing() }, this.timing.pingIntervalMs)
  }

  private async exchangePing() {
    if (
      this.lifecycle.isDisposed() ||
      (this.state !== 'configuring' && this.state !== 'running') ||
      this.pingBusy ||
      !this.runId
    ) return
    this.pingBusy = true
    const pingAttempt = ++this.pingAttempt
    const runId = this.runId
    const generation = this.runGeneration
    const pingTimeoutMs = this.state === 'configuring'
      ? this.timing.deviceReadyTimeoutMs + 2_000
      : this.timing.pingTimeoutMs
    try {
      await this.sendRequest(
        'ping',
        { run_id: runId, generation },
        (message) => message.kind === 'pong' &&
          message.boot_id === this.bootId &&
          message.run_id === runId &&
          message.generation === generation,
        pingTimeoutMs,
      )
      if (
        this.pingAttempt === pingAttempt &&
        (this.state === 'configuring' || this.state === 'running') &&
        this.runId === runId
      ) {
        this.missedPongs = 0
      }
    } catch {
      if (
        this.pingAttempt === pingAttempt &&
        (this.state === 'configuring' || this.state === 'running') &&
        this.runId === runId
      ) {
        this.missedPongs += 1
        if (this.missedPongs >= 3) {
          await this.failSession('USB 게이트웨이가 연결 유지 신호에 응답하지 않습니다.')
        }
      }
    } finally {
      if (this.pingAttempt === pingAttempt) this.pingBusy = false
    }
  }

  private async failSession(message: string) {
    if (
      this.lifecycle.isDisposed() ||
      this.closing ||
      this.state === 'error' ||
      this.state === 'stopping' ||
      this.state === 'idle'
    ) return
    this.clearPingTimer()
    await this.closeTransport()
    this.notify('error', 'USB 연결 오류', message, null)
  }

  private closeTransport() {
    if (this.closePromise) return this.closePromise
    const promise = this.performCloseTransport().finally(() => {
      if (this.closePromise === promise) this.closePromise = null
    })
    this.closePromise = promise
    return promise
  }

  private async performCloseTransport() {
    this.closing = true
    this.clearPingTimer()
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId)
      pending.reject(new ConnectionFailure('disconnected', 'USB 연결이 종료되었습니다.'))
      this.pendingRequests.delete(requestId)
    }
    for (const waiter of this.deviceReadyWaiters) {
      clearTimeout(waiter.timeoutId)
      waiter.reject(new ConnectionFailure('disconnected', 'USB 연결이 종료되었습니다.'))
      this.deviceReadyWaiters.delete(waiter)
    }
    const reader = this.reader
    if (reader) {
      try { await reader.cancel() } catch { }
    }
    if (this.readerLoop) {
      try { await this.readerLoop } catch { }
    }
    this.readerLoop = null
    if (this.writer) {
      try { this.writer.releaseLock() } catch { }
      this.writer = null
    }
    if (this.port) {
      try { await this.port.close() } catch { }
      this.port = null
    }
    this.reader = null
    this.decoder.reset()
    this.textDecoder.decode()
    this.resetRunState()
    this.closing = false
  }

  private resetRunState() {
    this.bootId = ''
    this.gatewayId = ''
    this.runId = ''
    this.runGeneration = 0
    this.lastSequence = 0
    this.run = null
    this.deviceSessionStarted = false
    this.bufferedDeviceReadyEvents = []
    this.bufferedSnapshots = []
    this.missedPongs = 0
  }

  private loadCachedIdentity(gatewayId: string): JumpRopeCachedIdentity | null {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(IDENTITY_STORAGE_KEY) ?? 'null')
      return isCachedIdentity(parsed) && parsed.gateway_id === gatewayId ? parsed : null
    } catch {
      return null
    }
  }

  private saveCachedIdentity(identity: JumpRopeCachedIdentity) {
    try {
      window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity))
    } catch {
      // 비공개 모드 등에서 저장소가 차단되어도 현재 측정은 계속한다.
    }
  }

  private clearCachedIdentity(gatewayId: string) {
    try {
      const cached = this.loadCachedIdentity(gatewayId)
      if (cached) window.localStorage.removeItem(IDENTITY_STORAGE_KEY)
    } catch {
      // 저장소 삭제가 차단되어도 현재 무핀 탐색은 계속한다.
    }
  }

  private requestTimeoutWithin(deadline: number) {
    if (Date.now() >= deadline) {
      throw new ConnectionFailure('transient', 'ATV JR203 게이트웨이 준비 시간이 초과되었습니다.')
    }
    return Math.max(1, Math.min(this.timing.requestTimeoutMs, deadline - Date.now()))
  }

  private createToken(prefix: string) {
    this.requestSequence += 1
    return `${prefix}_${Date.now().toString(36)}_${this.requestSequence.toString(36)}`
  }

  private assertCurrent(operation: number) {
    if (!this.lifecycle.isCurrent(operation)) {
      throw new ConnectionFailure('transient', 'USB 연결 작업이 취소되었습니다.')
    }
  }

  private clearPingTimer() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.pingAttempt += 1
    this.pingBusy = false
  }

  private notify(
    state: WebSerialJumpRopeState,
    statusText: string,
    error: string | null,
    run: WebSerialJumpRopeRun | null,
  ) {
    if (this.lifecycle.isDisposed()) return
    this.state = state
    this.onStatus({ state, statusText, error, run })
  }
}

export function useWebSerialJumpRope(
  onSnapshot: (event: JumpRopeSnapshotEvent, receivedAt: number) => void,
) {
  const eventHandlerRef = useRef(onSnapshot)
  const clientRef = useRef<WebSerialJumpRopeClient | null>(null)
  const [session, setSession] = useState<JumpRopeSessionStatus>({
    state: 'idle',
    statusText: 'USB 연결 대기',
    error: null,
    run: null,
  })

  useEffect(() => {
    eventHandlerRef.current = onSnapshot
  }, [onSnapshot])

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new WebSerialJumpRopeClient(
        (event, receivedAt) => eventHandlerRef.current(event, receivedAt),
        setSession,
      )
    }
    return clientRef.current
  }, [])

  const start = useCallback((config: JumpRopeStartConfig) => getClient().start(config), [getClient])
  const stop = useCallback(() => getClient().stop(), [getClient])

  useEffect(() => {
    const client = getClient()
    void client.preloadAuthorizedPorts()
    return () => { disposeOwnedResource(clientRef, client) }
  }, [getClient])

  return { ...session, start, stop }
}
