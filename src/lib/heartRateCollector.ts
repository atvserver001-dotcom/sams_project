import {
  GatewayHeartRateEvent,
  LiveHeartRateStats,
  addHeartRateSample,
} from './heartRateSerial'

export type HeartRateStatsByStudentNumber = Record<number, LiveHeartRateStats>

export interface HeartRateStatsCollector {
  begin(): void
  addSample(studentNumber: number, event: GatewayHeartRateEvent, receivedAt: number): boolean
  freeze(): HeartRateStatsByStudentNumber
  snapshot(): HeartRateStatsByStudentNumber
  reset(): void
  revision(): number
  isCollecting(): boolean
}

const cloneStats = (stats: HeartRateStatsByStudentNumber): HeartRateStatsByStudentNumber => {
  const snapshot: HeartRateStatsByStudentNumber = {}
  for (const [studentNumber, value] of Object.entries(stats)) {
    snapshot[Number(studentNumber)] = { ...value }
  }
  return snapshot
}

export function createHeartRateStatsCollector(): HeartRateStatsCollector {
  let collecting = false
  let currentRevision = 0
  let stats: HeartRateStatsByStudentNumber = {}

  return {
    begin() {
      collecting = true
      currentRevision = 0
      stats = {}
    },

    addSample(studentNumber, event, receivedAt) {
      if (!collecting) return false
      stats[studentNumber] = addHeartRateSample(stats[studentNumber], event, receivedAt)
      currentRevision += 1
      return true
    },

    freeze() {
      collecting = false
      return cloneStats(stats)
    },

    snapshot() {
      return cloneStats(stats)
    },

    reset() {
      collecting = false
      currentRevision = 0
      stats = {}
    },

    revision() {
      return currentRevision
    },

    isCollecting() {
      return collecting
    },
  }
}
