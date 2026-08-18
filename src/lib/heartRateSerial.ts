export const HEART_RATE_FRESH_MS = 2_000
export const HEART_RATE_OFFLINE_MS = 5_000
export const HEART_RATE_GATEWAY_PRODUCT = 'ATV_CL830_WEB_SERIAL_GATEWAY'
export const HEART_RATE_NDJSON_MAX_LINE_LENGTH = 2_048
export const HEART_RATE_SERIAL_BAUD_RATE = 115_200
export const HEART_RATE_GATEWAY_RX_LINE_MAX = 255
export const HEART_RATE_GATEWAY_LEASE_MS = 5_000

const REQUIRED_GATEWAY_CAPABILITIES = [
  'cl830_a1_a2',
  'run_gate',
  'heartbeat_lease',
  'fresh_event_sequence',
] as const

export interface GatewayAliases {
  be_decimal: string
  be_decimal_min7: string
  le_decimal: string
}

export interface GatewayHeartRateEvent extends GatewayMessage {
  v: 1
  kind: 'heart_rate'
  boot_id: string
  run_id: string
  source_key: string
  aliases: GatewayAliases
  bpm: number
  battery_percent: number | null
  seq: number
  fresh: true
}

export interface GatewayMessage {
  v: number
  kind: string
  request_id?: string
  boot_id?: string
  run_id?: string
  product?: string
  command?: string
  state?: string
  code?: string
  message?: string
  reason?: string
  [key: string]: unknown
}

export interface GatewayCapsMessage extends GatewayMessage {
  kind: 'caps'
  boot_id: string
  gateway_id: string
  capabilities: string[]
}

export interface HeartRateDeviceMapping {
  student_no: number
  device_id: string
}

export interface LiveHeartRateStats {
  currentBpm: number
  maxBpm: number
  minBpm: number
  totalBpm: number
  sampleCount: number
  batteryPercent: number | null
  lastReceivedAt: number
}

export type HeartRateSignalState = 'waiting' | 'fresh' | 'stale' | 'offline'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const isFiniteInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
)

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0
)

export class NdjsonMessageDecoder {
  private buffer = ''
  private discardingOversizeLine = false

  push(chunk: string): GatewayMessage[] {
    const messages: GatewayMessage[] = []
    let remaining = this.buffer + chunk
    this.buffer = ''

    while (remaining.length > 0) {
      const newlineIndex = remaining.indexOf('\n')
      if (newlineIndex === -1) {
        if (this.discardingOversizeLine || remaining.length > HEART_RATE_NDJSON_MAX_LINE_LENGTH) {
          this.discardingOversizeLine = true
        } else {
          this.buffer = remaining
        }
        break
      }

      const rawLine = remaining.slice(0, newlineIndex)
      remaining = remaining.slice(newlineIndex + 1)
      if (this.discardingOversizeLine) {
        this.discardingOversizeLine = false
        continue
      }
      if (rawLine.length > HEART_RATE_NDJSON_MAX_LINE_LENGTH) continue

      const line = rawLine.trim()
      if (!line) continue

      try {
        const parsed: unknown = JSON.parse(line)
        const message = parseGatewayMessage(parsed)
        if (message) messages.push(message)
      } catch {
        // 부팅 로그나 손상된 한 줄은 다음 NDJSON 메시지와 섞지 않고 버린다.
      }
    }
    return messages
  }

  reset() {
    this.buffer = ''
    this.discardingOversizeLine = false
  }
}

export function parseGatewayMessage(value: unknown): GatewayMessage | null {
  if (!isRecord(value) || !isFiniteInteger(value.v) || typeof value.kind !== 'string') {
    return null
  }
  return value as GatewayMessage
}

export function parseHeartRateEvent(message: GatewayMessage): GatewayHeartRateEvent | null {
  if (
    message.v !== 1 ||
    message.kind !== 'heart_rate' ||
    typeof message.boot_id !== 'string' ||
    typeof message.run_id !== 'string' ||
    typeof message.source_key !== 'string' ||
    !/^cl830:[0-9a-f]{8}$/.test(message.source_key) ||
    !isRecord(message.aliases) ||
    typeof message.aliases.be_decimal !== 'string' ||
    typeof message.aliases.be_decimal_min7 !== 'string' ||
    !/^\d{7}$/.test(message.aliases.be_decimal_min7) ||
    typeof message.aliases.le_decimal !== 'string' ||
    !isFiniteInteger(message.bpm) ||
    message.bpm <= 0 ||
    message.bpm > 255 ||
    !(message.battery_percent === null || (
      isFiniteInteger(message.battery_percent) &&
      message.battery_percent >= 0 &&
      message.battery_percent <= 100
    )) ||
    !isFiniteInteger(message.seq) ||
    message.seq <= 0 ||
    message.fresh !== true
  ) {
    return null
  }

  const rawHex = message.source_key.slice('cl830:'.length)
  const bytes = rawHex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16))
  if (!bytes || bytes.length !== 4) return null

  const bigEndian = Number.parseInt(rawHex, 16)
  const littleEndian = bytes[0] +
    bytes[1] * 0x100 +
    bytes[2] * 0x1_0000 +
    bytes[3] * 0x100_0000

  if (
    message.aliases.be_decimal !== String(bigEndian) ||
    message.aliases.be_decimal_min7 !== String(bigEndian).padStart(7, '0') ||
    message.aliases.le_decimal !== String(littleEndian)
  ) {
    return null
  }

  return message as unknown as GatewayHeartRateEvent
}

export function isHeartRateEventForRun(
  event: GatewayHeartRateEvent,
  session: { bootId: string; runId: string; lastSequence: number },
) {
  return event.boot_id === session.bootId &&
    event.run_id === session.runId &&
    event.seq > session.lastSequence
}

export function isExpectedGatewayCaps(message: GatewayMessage): message is GatewayCapsMessage {
  const capabilities = message.capabilities
  if (
    message.v !== 1 ||
    message.kind !== 'caps' ||
    message.product !== HEART_RATE_GATEWAY_PRODUCT ||
    message.protocol !== 1 ||
    message.state !== 'ready' ||
    message.baud !== HEART_RATE_SERIAL_BAUD_RATE ||
    message.rx_line_max !== HEART_RATE_GATEWAY_RX_LINE_MAX ||
    message.lease_default_ms !== HEART_RATE_GATEWAY_LEASE_MS ||
    !isFiniteInteger(message.lease_min_ms) ||
    !isFiniteInteger(message.lease_max_ms) ||
    message.lease_min_ms > HEART_RATE_GATEWAY_LEASE_MS ||
    message.lease_max_ms < HEART_RATE_GATEWAY_LEASE_MS ||
    !isNonEmptyString(message.gateway_id) ||
    !isNonEmptyString(message.boot_id) ||
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === 'string')
  ) {
    return false
  }

  return REQUIRED_GATEWAY_CAPABILITIES.every(
    (capability) => capabilities.includes(capability),
  )
}

export function isExpectedRunStartAck(
  message: GatewayMessage,
  session: { bootId: string; runId: string },
) {
  return message.v === 1 &&
    message.kind === 'ack' &&
    message.command === 'run_start' &&
    message.boot_id === session.bootId &&
    message.run_id === session.runId &&
    message.state === 'running' &&
    isFiniteInteger(message.generation) &&
    message.generation > 0 &&
    isFiniteInteger(message.lease_remaining_ms) &&
    message.lease_remaining_ms > 0 &&
    message.lease_remaining_ms <= HEART_RATE_GATEWAY_LEASE_MS
}

export function findMappedStudentNumber(
  event: GatewayHeartRateEvent,
  mappings: HeartRateDeviceMapping[],
) {
  // 학생 매핑의 기준 ID는 CL830 big-endian 7자리 decimal 표기뿐이다.
  // source_key와 little-endian/10자리 값은 진단 정보로만 남기며 학생에 연결하지 않는다.
  const matches = mappings.filter(
    (mapping) => mapping.device_id === event.aliases.be_decimal_min7,
  )
  return matches.length === 1 ? matches[0].student_no : null
}

export function addHeartRateSample(
  previous: LiveHeartRateStats | undefined,
  event: GatewayHeartRateEvent,
  receivedAt: number,
): LiveHeartRateStats {
  if (!previous) {
    return {
      currentBpm: event.bpm,
      maxBpm: event.bpm,
      minBpm: event.bpm,
      totalBpm: event.bpm,
      sampleCount: 1,
      batteryPercent: event.battery_percent,
      lastReceivedAt: receivedAt,
    }
  }

  return {
    currentBpm: event.bpm,
    maxBpm: Math.max(previous.maxBpm, event.bpm),
    minBpm: Math.min(previous.minBpm, event.bpm),
    totalBpm: previous.totalBpm + event.bpm,
    sampleCount: previous.sampleCount + 1,
    batteryPercent: event.battery_percent ?? previous.batteryPercent,
    lastReceivedAt: receivedAt,
  }
}

export function averageHeartRate(stats: LiveHeartRateStats) {
  return Math.round((stats.totalBpm / stats.sampleCount) * 10) / 10
}

export function getHeartRateSignalState(
  stats: LiveHeartRateStats | undefined,
  now: number,
): HeartRateSignalState {
  if (!stats) return 'waiting'
  const age = Math.max(0, now - stats.lastReceivedAt)
  if (age <= HEART_RATE_FRESH_MS) return 'fresh'
  if (age <= HEART_RATE_OFFLINE_MS) return 'stale'
  return 'offline'
}

export function currentHeartRateForSignal(
  stats: LiveHeartRateStats | undefined,
  signalState: HeartRateSignalState,
) {
  return stats && signalState === 'fresh' ? stats.currentBpm : null
}
