import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebSerialJumpRopeClient } from './useWebSerialJumpRope'

interface GatewayOptions {
  product?: string
  emitSnapshotOnStart?: boolean
  deviceReadyDelayMs?: number
  disconnectPendingOnce?: boolean
  helloDisconnectPendingCount?: number
  dropFirstRunStartAck?: boolean
  skipFirstPinnedDeviceReady?: boolean
  pingResponseDelayMs?: number
}

class MemoryStorage {
  private readonly values = new Map<string, string>()
  private removals = 0

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.removals += 1
    this.values.delete(key)
  }

  removalCount() {
    return this.removals
  }
}

function createGateway(options: GatewayOptions = {}) {
  const commands: Array<Record<string, unknown>> = []
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let generation = 0
  let activeRunId = ''
  let profile: Record<string, unknown> = {}
  let openCount = 0
  let closeCount = 0
  let disconnectPendingSent = false
  let helloDisconnectPendingRemaining = options.helloDisconnectPendingCount ?? 0
  let runStartAckDropped = false
  let pinnedDeviceReadySkipped = false

  const readable = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController
    },
  })
  const enqueue = (message: Record<string, unknown>, delayMs = 0) => {
    const send = () => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`))
    if (delayMs > 0) setTimeout(send, delayMs)
    else send()
  }
  const envelope = (message: Record<string, unknown>) => ({
    v: 1,
    boot_id: 'boot-1',
    ...message,
  })
  const ack = (
    request: Record<string, unknown>,
    command: string,
    fields: Record<string, unknown> = {},
  ) => enqueue(envelope({
    kind: 'ack',
    request_id: request.request_id,
    command,
    run_id: request.run_id,
    generation,
    ...fields,
  }))

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const request = JSON.parse(decoder.decode(chunk).trim()) as Record<string, unknown>
      commands.push(request)

      if (request.kind === 'hello') {
        if (helloDisconnectPendingRemaining > 0) {
          helloDisconnectPendingRemaining -= 1
          enqueue(envelope({
            kind: 'error',
            request_id: request.request_id,
            code: 'disconnect_pending',
            message: 'BLE teardown is still pending',
            retryable: true,
            retry_after_ms: 250,
            state: 'stopping',
          }))
          return
        }
        enqueue(envelope({
          kind: 'caps',
          request_id: request.request_id,
          product: options.product ?? 'ATV_CHILEAF_GATT_WEB_SERIAL_PROBE',
          protocol: 1,
          state: activeRunId ? 'running' : 'ready',
          baud: 115200,
          rx_line_max: 767,
          lease_min_ms: 1000,
          lease_default_ms: 5000,
          lease_max_ms: 30000,
          gateway_id: 'gateway-1',
          max_active_devices: 1,
          capabilities: [
            'chileaf_jr203_gatt_v1',
            'jump_rope_count',
            'mode_control',
            'run_gate',
            'heartbeat_lease',
            'fresh_event_sequence',
          ],
        }))
        return
      }
      if (request.kind === 'profile_set') {
        profile = request
        ack(request, 'profile_set')
        return
      }
      if (request.kind === 'run_start') {
        const requestedRunId = String(request.run_id)
        if (activeRunId !== requestedRunId) {
          generation += 1
          activeRunId = requestedRunId
        }
        if (options.dropFirstRunStartAck && !runStartAckDropped) {
          runStartAckDropped = true
          return
        }
        ack(request, 'run_start', { state: 'running', lease_remaining_ms: 5000 })
        if (
          options.skipFirstPinnedDeviceReady &&
          typeof profile.address === 'string' &&
          !pinnedDeviceReadySkipped
        ) {
          pinnedDeviceReadySkipped = true
          return
        }
        enqueue(envelope({
          kind: 'device_ready',
          run_id: activeRunId,
          generation,
          slot: 1,
          address: 'ec:67:0e:8b:da:97',
          address_type: 0,
          name: 'JR260-0923081',
          identity_verified: typeof profile.address === 'string',
        }), options.deviceReadyDelayMs)
        return
      }
      if (request.kind === 'run_stop') {
        if (options.disconnectPendingOnce && !disconnectPendingSent) {
          disconnectPendingSent = true
          enqueue(envelope({
            kind: 'error',
            request_id: request.request_id,
            code: 'disconnect_pending',
            message: 'BLE teardown is still pending',
            retryable: true,
            retry_after_ms: 250,
            state: 'stopping',
            run_id: request.run_id,
            generation,
          }))
          return
        }
        ack(request, 'run_stop', {
          state: 'ready',
          running: false,
          connected: false,
          lease_remaining_ms: 0,
        })
        activeRunId = ''
        profile = {}
        return
      }
      if (request.kind === 'control') {
        ack(request, String(request.op))
        if (request.op === 'session_start' && options.emitSnapshotOnStart) {
          enqueue(envelope({
            kind: 'jump_rope_snapshot',
            run_id: activeRunId,
            generation,
            seq: 10,
            fresh: true,
            slot: 1,
            count: 12,
            mode: request.mode,
            count_up_minute: 0,
            count_up_second: 12,
            count_down_minute: 0,
            count_down_second: 48,
            battery_percent: 84,
            rssi_dbm: -51,
          }))
        }
        return
      }
      if (request.kind === 'ping') {
        enqueue(envelope({
          kind: 'pong',
          request_id: request.request_id,
          run_id: activeRunId,
          generation,
        }), options.pingResponseDelayMs)
        return
      }
      throw new Error(`Unexpected command: ${String(request.kind)}`)
    },
  })

  const port = {
    readable,
    writable,
    async open() { openCount += 1 },
    async close() { closeCount += 1 },
    getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 } },
  }

  return {
    commands,
    port,
    enqueue,
    openCount: () => openCount,
    closeCount: () => closeCount,
    generation: () => generation,
    activeRunId: () => activeRunId,
  }
}

function installSerial(
  port: ReturnType<typeof createGateway>['port'],
  storage = new MemoryStorage(),
) {
  let pickerCount = 0
  const serial = {
    async getPorts() { return [] },
    async requestPort() {
      pickerCount += 1
      return port
    },
    addEventListener() { },
    removeEventListener() { },
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { isSecureContext: true, localStorage: storage },
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serial },
  })
  return { pickerCount: () => pickerCount, storage }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

afterEach(() => {
  vi.useRealTimers()
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  else Reflect.deleteProperty(globalThis, 'navigator')
})

const clientTiming = {
  handshakeTimeoutMs: 200,
  deviceReadyTimeoutMs: 200,
  requestTimeoutMs: 50,
  runStartTimeoutMs: 50,
  retryDelayMs: 1,
  openRetryDelayMs: 1,
  pingIntervalMs: 60_000,
  pingTimeoutMs: 50,
}

describe('WebSerialJumpRopeClient', () => {
  it('pins a discovered identity once, configures count mode, and stops in protocol order', async () => {
    const gateway = createGateway({ emitSnapshotOnStart: true })
    const installed = installSerial(gateway.port)
    const snapshots: number[] = []
    const statuses: string[] = []
    const client = new WebSerialJumpRopeClient(
      (event) => snapshots.push(event.count),
      (status) => statuses.push(status.state),
      clientTiming,
    )

    const run = await client.start({ mode: 1, target: 120 })
    expect(run).toMatchObject({
      bootId: 'boot-1',
      gatewayId: 'gateway-1',
      generation: 2,
      mode: 1,
      target: 120,
      device: { identity_verified: true },
    })
    expect(installed.pickerCount()).toBe(1)
    expect(gateway.commands.map((command) => command.kind)).toEqual([
      'hello',
      'profile_set',
      'run_start',
      'run_stop',
      'profile_set',
      'run_start',
      'control',
      'control',
      'control',
    ])
    const profiles = gateway.commands.filter((command) => command.kind === 'profile_set')
    expect(profiles[0]).not.toHaveProperty('address')
    expect(profiles[1]).toMatchObject({
      slot: 1,
      handle: 'jump-rope-slot-01',
      driver: 'chileaf_jr203_gatt_v1',
      name_prefix: 'JR',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      wire_dialect: 'JR203_WX_1_1_2',
      write_mode: 'without_response',
    })
    const controls = gateway.commands.filter((command) => command.kind === 'control')
    expect(controls.map((command) => command.op)).toEqual(['time_sync', 'mode_set', 'session_start'])
    expect(controls[1]).toMatchObject({ mode: 1, target: 120, minutes: 0, seconds: 0 })
    expect(controls[2]).toMatchObject({ mode: 1, target: 120 })
    expect(snapshots).toEqual([12])
    expect(statuses.at(-1)).toBe('running')

    await client.stop()
    expect(gateway.commands.slice(-2).map((command) => [command.kind, command.op])).toEqual([
      ['control', 'session_stop'],
      ['run_stop', undefined],
    ])
    expect(gateway.commands.at(-2)).toMatchObject({ mode: 1, target: 120 })
    expect(gateway.closeCount()).toBe(1)
  })

  it('uses a cached identity and keeps exam mode fixed at 60 seconds without mode_set', async () => {
    const gateway = createGateway()
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      name: 'JR260-0923081',
    }))
    installSerial(gateway.port, storage)
    const client = new WebSerialJumpRopeClient(() => undefined, () => undefined, clientTiming)

    const run = await client.start({ mode: 3, target: 999 })
    expect(run).toMatchObject({ generation: 1, mode: 3, target: 60 })
    expect(gateway.commands.filter((command) => command.kind === 'profile_set')).toHaveLength(1)
    const controls = gateway.commands.filter((command) => command.kind === 'control')
    expect(controls.map((command) => command.op)).toEqual(['time_sync', 'session_start'])
    expect(controls[1]).toMatchObject({ mode: 3, target: 60 })
    await client.stop()
  })

  it('rejects the wrong gateway product before profile_set', async () => {
    const gateway = createGateway({ product: 'ATV_CL830_WEB_SERIAL_GATEWAY' })
    installSerial(gateway.port)
    const statuses: Array<{ state: string; error: string | null }> = []
    const client = new WebSerialJumpRopeClient(
      () => undefined,
      (status) => statuses.push({ state: status.state, error: status.error }),
      clientTiming,
    )

    await expect(client.start({ mode: 0, target: 0 })).resolves.toBeNull()
    expect(gateway.commands.map((command) => command.kind)).toEqual(['hello'])
    expect(statuses.at(-1)).toMatchObject({ state: 'error' })
    expect(statuses.at(-1)?.error).toContain('ATV JR203')
  })

  it('ignores duplicate and out-of-order absolute count snapshots', async () => {
    const gateway = createGateway()
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      name: 'JR260-0923081',
    }))
    installSerial(gateway.port, storage)
    const received: number[] = []
    const client = new WebSerialJumpRopeClient((event) => received.push(event.count), () => undefined, clientTiming)
    const run = await client.start({ mode: 0, target: 0 })

    const emit = (seq: number, count: number) => gateway.enqueue({
      v: 1,
      kind: 'jump_rope_snapshot',
      boot_id: 'boot-1',
      run_id: run?.runId,
      generation: run?.generation,
      seq,
      fresh: true,
      slot: 1,
      count,
      mode: 0,
      count_up_minute: 0,
      count_up_second: count,
      count_down_minute: 0,
      count_down_second: 0,
      battery_percent: 75,
      rssi_dbm: -45,
    })
    emit(20, 3)
    emit(20, 999)
    emit(19, 998)
    emit(21, 4)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(received).toEqual([3, 4])
    await client.stop()
  })

  it('starts ping immediately after run_start so the five-second lease survives GATT discovery', async () => {
    const gateway = createGateway({ deviceReadyDelayMs: 35 })
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      name: 'JR260-0923081',
    }))
    installSerial(gateway.port, storage)
    const client = new WebSerialJumpRopeClient(
      () => undefined,
      () => undefined,
      { ...clientTiming, pingIntervalMs: 10 },
    )

    await expect(client.start({ mode: 0, target: 0 })).resolves.not.toBeNull()
    const kinds = gateway.commands.map((command) => command.kind === 'control' ? command.op : command.kind)
    expect(kinds).toContain('ping')
    expect(kinds.indexOf('ping')).toBeLessThan(kinds.indexOf('time_sync'))
    await client.stop()
  })

  it('keeps one configuring ping pending through a GATT stall longer than five seconds', async () => {
    vi.useFakeTimers()
    const gateway = createGateway({ deviceReadyDelayMs: 7_000, pingResponseDelayMs: 6_000 })
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      name: 'JR260-0923081',
    }))
    installSerial(gateway.port, storage)
    const statuses: string[] = []
    const client = new WebSerialJumpRopeClient(
      () => undefined,
      (status) => statuses.push(status.state),
      {
        ...clientTiming,
        deviceReadyTimeoutMs: 10_000,
        pingIntervalMs: 1_000,
        pingTimeoutMs: 50,
      },
    )

    const startPromise = client.start({ mode: 0, target: 0 })
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await Promise.resolve()
      if (gateway.commands.some((command) => command.kind === 'run_start')) break
    }
    expect(gateway.commands.some((command) => command.kind === 'run_start')).toBe(true)

    await vi.advanceTimersByTimeAsync(7_000)
    await expect(startPromise).resolves.not.toBeNull()
    expect(statuses).not.toContain('error')
    expect(gateway.commands.filter((command) => command.kind === 'ping')).toHaveLength(1)
    await client.stop()
  })

  it('clears a stale cached identity and performs one unpinned discovery fallback', async () => {
    const gateway = createGateway({ skipFirstPinnedDeviceReady: true })
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:00',
      address_type: 0,
      name: 'JR-OLD',
    }))
    installSerial(gateway.port, storage)
    const client = new WebSerialJumpRopeClient(
      () => undefined,
      () => undefined,
      { ...clientTiming, deviceReadyTimeoutMs: 30 },
    )

    const run = await client.start({ mode: 0, target: 0 })
    const profiles = gateway.commands.filter((command) => command.kind === 'profile_set')
    expect(run).toMatchObject({ generation: 3, device: { identity_verified: true } })
    expect(profiles).toHaveLength(3)
    expect(profiles.map((profile) => typeof profile.address === 'string')).toEqual([true, false, true])
    expect(storage.removalCount()).toBe(1)
    expect(JSON.parse(storage.getItem('atv.jump-rope.jr203.identity.v1') ?? '{}')).toMatchObject({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
    })
    await client.stop()
  })

  it('retries disconnect_pending run_stop once with the same run ID', async () => {
    const gateway = createGateway({ disconnectPendingOnce: true })
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      name: 'JR260-0923081',
    }))
    installSerial(gateway.port, storage)
    const client = new WebSerialJumpRopeClient(() => undefined, () => undefined, clientTiming)
    await client.start({ mode: 0, target: 0 })
    await client.stop()

    const runStops = gateway.commands.filter((command) => command.kind === 'run_stop')
    expect(runStops).toHaveLength(2)
    expect(runStops[0].run_id).toBe(runStops[1].run_id)
    expect(runStops[0].generation).toBe(runStops[1].generation)
  })

  it('retries a lost run_start ACK with one stable run ID', async () => {
    const gateway = createGateway({ dropFirstRunStartAck: true })
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      name: 'JR260-0923081',
    }))
    installSerial(gateway.port, storage)
    const client = new WebSerialJumpRopeClient(() => undefined, () => undefined, clientTiming)

    const run = await client.start({ mode: 0, target: 0 })
    const starts = gateway.commands.filter((command) => command.kind === 'run_start')
    expect(run?.generation).toBe(1)
    expect(starts).toHaveLength(2)
    expect(starts[0].run_id).toBe(starts[1].run_id)
    await client.stop()
  })

  it('waits through a retryable disconnect_pending hello response', async () => {
    const gateway = createGateway({ helloDisconnectPendingCount: 1 })
    const storage = new MemoryStorage()
    storage.setItem('atv.jump-rope.jr203.identity.v1', JSON.stringify({
      gateway_id: 'gateway-1',
      address: 'ec:67:0e:8b:da:97',
      address_type: 0,
      name: 'JR260-0923081',
    }))
    installSerial(gateway.port, storage)
    const client = new WebSerialJumpRopeClient(() => undefined, () => undefined, {
      ...clientTiming,
      handshakeTimeoutMs: 1_000,
    })

    await expect(client.start({ mode: 0, target: 0 })).resolves.not.toBeNull()
    expect(gateway.commands.filter((command) => command.kind === 'hello')).toHaveLength(2)
    await client.stop()
  })
})
