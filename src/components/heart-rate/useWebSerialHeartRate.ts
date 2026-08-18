'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  GatewayHeartRateEvent,
  GatewayMessage,
  HEART_RATE_GATEWAY_LEASE_MS,
  HEART_RATE_SERIAL_BAUD_RATE,
  NdjsonMessageDecoder,
  isExpectedGatewayCaps,
  isExpectedRunStartAck,
  isHeartRateEventForRun,
  parseHeartRateEvent,
} from '@/lib/heartRateSerial'
import { OperationGeneration } from '@/lib/operationGeneration'
import { disposeOwnedResource } from '@/lib/ownedResource'

export type WebSerialSessionState = 'idle' | 'connecting' | 'handshaking' | 'running' | 'stopping' | 'error'

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

interface SerialApiLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>
}

interface PendingRequest {
  matches(message: GatewayMessage): boolean
  resolve(message: GatewayMessage): void
  reject(error: Error): void
  timeoutId: ReturnType<typeof setTimeout>
}

interface SessionStatus {
  state: WebSerialSessionState
  statusText: string
  error: string | null
}

const CP210X_FILTER: SerialPortInfo = { usbVendorId: 0x10c4, usbProductId: 0xea60 }

const isCp210xPort = (port: SerialPortLike) => {
  const info = port.getInfo()
  return info.usbVendorId === CP210X_FILTER.usbVendorId &&
    info.usbProductId === CP210X_FILTER.usbProductId
}

const delay = (durationMs: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, durationMs)
})

const errorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'USB 포트 선택이 취소되었습니다.'
  }
  if (error instanceof Error) return error.message
  return String(error)
}

class WebSerialHeartRateClient {
  private readonly lifecycle = new OperationGeneration()
  private readonly decoder = new NdjsonMessageDecoder()
  private readonly textDecoder = new TextDecoder()
  private readonly textEncoder = new TextEncoder()
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private port: SerialPortLike | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private readerLoop: Promise<void> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private requestSequence = 0
  private bootId = ''
  private runId = ''
  private lastSequence = 0
  private missedPongs = 0
  private pingBusy = false
  private closing = false
  private forcePickerNext = false
  private authorizedPorts: SerialPortLike[] = []
  private state: WebSerialSessionState = 'idle'
  private startPromise: Promise<void> | null = null
  private stopPromise: Promise<void> | null = null
  private disposePromise: Promise<void> | null = null
  private closePromise: Promise<void> | null = null

  constructor(
    private readonly onHeartRate: (event: GatewayHeartRateEvent, receivedAt: number) => void,
    private readonly onStatus: (status: SessionStatus) => void,
  ) { }

  async preloadAuthorizedPorts() {
    const operation = this.lifecycle.capture()
    try {
      const ports = await this.getSerialApi().getPorts()
      if (!this.lifecycle.isCurrent(operation)) return
      this.authorizedPorts = ports.filter(isCp210xPort)
    } catch {
      if (!this.lifecycle.isCurrent(operation)) return
      this.authorizedPorts = []
    }
  }

  start() {
    if (this.lifecycle.isDisposed()) return Promise.resolve()
    if (this.startPromise) return this.startPromise
    if (this.state === 'stopping' || this.state === 'running') return Promise.resolve()

    const operation = this.lifecycle.begin()

    this.notify('connecting', 'USB 심박 수신기를 찾는 중입니다.', null)
    this.lastSequence = 0
    this.bootId = ''
    this.runId = ''
    this.missedPongs = 0

    const promise = this.performStart(operation).finally(() => {
      if (this.startPromise === promise) this.startPromise = null
    })
    this.startPromise = promise
    return promise
  }

  private async performStart(operation: number) {
    try {
      const serial = this.getSerialApi()
      let ports: SerialPortLike[]

      if (this.forcePickerNext) {
        ports = [await serial.requestPort({ filters: [CP210X_FILTER] })]
        if (!this.lifecycle.isCurrent(operation)) return
        this.authorizedPorts = ports
        this.forcePickerNext = false
      } else {
        // getPorts() 결과는 mount 시 미리 준비한다. 클릭 시에는 requestPort() 전에
        // 다른 비동기 작업을 두지 않아 브라우저의 사용자 활성 권한을 보존한다.
        ports = this.authorizedPorts
        if (ports.length === 0) {
          ports = [await serial.requestPort({ filters: [CP210X_FILTER] })]
          if (!this.lifecycle.isCurrent(operation)) return
          this.authorizedPorts = ports
        }
      }

      let lastError: unknown = null
      for (const port of ports) {
        if (!this.lifecycle.isCurrent(operation)) return
        try {
          await this.connectPort(port, operation)
          if (!this.lifecycle.isCurrent(operation)) return
          return
        } catch (error) {
          lastError = error
          await this.closeTransport()
          if (!this.lifecycle.isCurrent(operation)) return
        }
      }

      this.forcePickerNext = true
      throw lastError ?? new Error('사용 가능한 USB 심박 수신기를 찾지 못했습니다.')
    } catch (error) {
      await this.closeTransport()
      if (!this.lifecycle.isCurrent(operation)) return
      const suffix = this.forcePickerNext ? ' 다시 시작하면 다른 포트를 선택할 수 있습니다.' : ''
      this.notify('error', 'USB 연결 실패', `${errorMessage(error)}${suffix}`)
    }
  }

  stop() {
    if (this.lifecycle.isDisposed()) return this.disposePromise ?? Promise.resolve()
    if (this.stopPromise) return this.stopPromise
    if (this.state === 'idle') return Promise.resolve()

    const operation = this.lifecycle.begin()

    this.notify('stopping', '측정을 안전하게 종료하는 중입니다.', null)
    this.clearPingTimer()

    const promise = this.performStop(operation).finally(() => {
      if (this.stopPromise === promise) this.stopPromise = null
    })
    this.stopPromise = promise
    return promise
  }

  private async performStop(operation: number) {
    try {
      if (this.writer && this.runId) {
        const runId = this.runId
        await this.sendRequest(
          'run_stop',
          { run_id: runId },
          (message) => message.kind === 'ack' && message.command === 'run_stop' && message.run_id === runId,
          1_500,
        )
        if (!this.lifecycle.isCurrent(operation)) return
      }
    } catch {
      // 장치가 분리된 경우에도 브라우저 쪽 포트와 리더는 반드시 정리한다.
    } finally {
      await this.closeTransport()
      if (this.lifecycle.isCurrent(operation)) {
        this.notify('idle', '측정이 종료되었습니다.', null)
      }
    }
  }

  dispose() {
    if (this.disposePromise) return this.disposePromise
    const activeStart = this.startPromise
    const activeStop = this.stopPromise
    this.lifecycle.dispose()

    const promise = this.performDispose(activeStart, activeStop)
    this.disposePromise = promise
    return promise
  }

  private async performDispose(activeStart: Promise<void> | null, activeStop: Promise<void> | null) {
    this.clearPingTimer()
    if (activeStop) {
      try { await activeStop } catch { }
    } else if (this.writer && this.runId) {
      const runId = this.runId
      try {
        await this.sendRequest(
          'run_stop',
          { run_id: runId },
          (message) => message.kind === 'ack' && message.command === 'run_stop' && message.run_id === runId,
          500,
        )
      } catch {
        // 화면 종료 중에는 장치의 lease 만료가 최종 안전장치가 된다.
      }
    }
    await this.closeTransport()
    if (activeStart) {
      try { await activeStart } catch { }
      await this.closeTransport()
    }
  }

  private getSerialApi() {
    if (!window.isSecureContext) {
      throw new Error('USB 연결은 HTTPS 또는 localhost에서만 사용할 수 있습니다.')
    }

    const serial = (navigator as Navigator & { serial?: SerialApiLike }).serial
    if (!serial) {
      throw new Error('이 브라우저는 Web Serial을 지원하지 않습니다. Windows용 Chrome 또는 Edge를 사용해 주세요.')
    }
    return serial
  }

  private async connectPort(port: SerialPortLike, operation: number) {
    this.port = port
    this.closing = false
    this.decoder.reset()

    try {
      await port.open({ baudRate: HEART_RATE_SERIAL_BAUD_RATE })
      this.assertCurrent(operation)
      if (!port.readable || !port.writable) {
        throw new Error('USB 포트의 읽기/쓰기 스트림을 열 수 없습니다.')
      }

      this.reader = port.readable.getReader()
      this.writer = port.writable.getWriter()
      this.readerLoop = this.readMessages()

      this.notify('handshaking', 'ATV 심박 수신기와 연결을 확인하는 중입니다.', null)
      // 포트를 열 때 보드가 재부팅될 수 있으므로 펌웨어 초기화 시간을 확보한다.
      await delay(700)
      this.assertCurrent(operation)

      const caps = await this.sendRequest(
        'hello',
        {},
        (message) => message.kind === 'caps',
        3_000,
      )
      this.assertCurrent(operation)
      if (!isExpectedGatewayCaps(caps)) {
        throw new Error('선택한 포트가 ATV 심박 수신기가 아닙니다.')
      }

      this.bootId = caps.boot_id
      this.runId = this.createToken('run')

      const ack = await this.sendRequest(
        'run_start',
        { run_id: this.runId, lease_ms: HEART_RATE_GATEWAY_LEASE_MS },
        (message) => message.kind === 'ack' && message.command === 'run_start' && message.run_id === this.runId,
        3_000,
      )
      this.assertCurrent(operation)
      if (!isExpectedRunStartAck(ack, { bootId: this.bootId, runId: this.runId })) {
        throw new Error('심박 측정 세션을 시작하지 못했습니다.')
      }

      this.notify('running', 'USB 수신기 연결됨 · 심박 신호를 기다리는 중', null)
      this.startPingTimer()
    } catch (error) {
      if (!this.lifecycle.isCurrent(operation)) {
        await this.closeTransport()
        try { await port.close() } catch { }
      }
      throw error
    }
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
        for (const message of this.decoder.push(text)) {
          this.handleMessage(message)
        }
      }

      if (!this.closing) {
        void this.failSession('USB 수신기 연결이 종료되었습니다.')
      }
    } catch (error) {
      if (!this.closing) {
        void this.failSession(`USB 데이터 수신 오류: ${errorMessage(error)}`)
      }
    } finally {
      if (this.reader === reader) this.reader = null
      reader.releaseLock()
    }
  }

  private handleMessage(message: GatewayMessage) {
    if (message.request_id) {
      const pending = this.pendingRequests.get(message.request_id)
      if (pending) {
        if (message.kind === 'error') {
          clearTimeout(pending.timeoutId)
          this.pendingRequests.delete(message.request_id)
          pending.reject(new Error(message.message || message.code || '장치 명령 처리 오류'))
        } else if (pending.matches(message)) {
          clearTimeout(pending.timeoutId)
          this.pendingRequests.delete(message.request_id)
          pending.resolve(message)
        }
      }
    }

    if (this.lifecycle.isDisposed()) return

    if (message.kind === 'status' && message.reason === 'lease_expired') {
      void this.failSession('USB 수신기와의 연결 유지 신호가 끊겼습니다.')
      return
    }

    const event = parseHeartRateEvent(message)
    if (!event || this.state !== 'running') return
    if (!isHeartRateEventForRun(event, {
      bootId: this.bootId,
      runId: this.runId,
      lastSequence: this.lastSequence,
    })) return

    this.lastSequence = event.seq
    this.onHeartRate(event, Date.now())
  }

  private sendRequest(
    kind: string,
    fields: Record<string, unknown>,
    matches: (message: GatewayMessage) => boolean,
    timeoutMs: number,
  ) {
    const requestId = this.createToken('req')
    const writer = this.writer
    if (!writer) return Promise.reject(new Error('USB 쓰기 스트림이 열려 있지 않습니다.'))

    return new Promise<GatewayMessage>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`${kind} 응답 시간이 초과되었습니다.`))
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
    this.pingTimer = setInterval(() => {
      void this.exchangePing()
    }, 1_000)
  }

  private async exchangePing() {
    if (this.lifecycle.isDisposed() || this.state !== 'running' || this.pingBusy || !this.runId) return
    this.pingBusy = true
    const runId = this.runId

    try {
      await this.sendRequest(
        'ping',
        { run_id: runId },
        (message) => message.kind === 'pong' && message.run_id === runId && message.boot_id === this.bootId,
        800,
      )
      if (this.state !== 'running' || this.runId !== runId) return
      this.missedPongs = 0
    } catch {
      if (this.state !== 'running' || this.runId !== runId) return
      this.missedPongs += 1
      if (this.missedPongs >= 3) {
        await this.failSession('USB 수신기가 연결 유지 신호에 응답하지 않습니다.')
      }
    } finally {
      this.pingBusy = false
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
    this.notify('error', 'USB 연결 오류', message)
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
      pending.reject(new Error('USB 연결이 종료되었습니다.'))
      this.pendingRequests.delete(requestId)
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
    this.bootId = ''
    this.runId = ''
    this.lastSequence = 0
    this.closing = false
  }

  private clearPingTimer() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.pingBusy = false
  }

  private createToken(prefix: string) {
    this.requestSequence += 1
    return `${prefix}_${Date.now().toString(36)}_${this.requestSequence.toString(36)}`
  }

  private assertCurrent(operation: number) {
    if (!this.lifecycle.isCurrent(operation)) {
      throw new Error('USB 연결 작업이 취소되었습니다.')
    }
  }

  private notify(state: WebSerialSessionState, statusText: string, error: string | null) {
    if (this.lifecycle.isDisposed()) return
    this.state = state
    this.onStatus({ state, statusText, error })
  }
}

export function useWebSerialHeartRate(
  onHeartRate: (event: GatewayHeartRateEvent, receivedAt: number) => void,
) {
  const eventHandlerRef = useRef(onHeartRate)
  const clientRef = useRef<WebSerialHeartRateClient | null>(null)
  const [session, setSession] = useState<SessionStatus>({
    state: 'idle',
    statusText: 'USB 연결 대기',
    error: null,
  })

  useEffect(() => {
    eventHandlerRef.current = onHeartRate
  }, [onHeartRate])

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new WebSerialHeartRateClient(
        (event, receivedAt) => eventHandlerRef.current(event, receivedAt),
        setSession,
      )
    }
    return clientRef.current
  }, [])

  const start = useCallback(async () => {
    await getClient().start()
  }, [getClient])

  const stop = useCallback(async () => {
    await getClient().stop()
  }, [getClient])

  useEffect(() => {
    const client = getClient()
    void client.preloadAuthorizedPorts()
    return () => { disposeOwnedResource(clientRef, client) }
  }, [getClient])

  return { ...session, start, stop }
}
