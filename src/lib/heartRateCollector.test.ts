import { describe, expect, it } from 'vitest'

import { GatewayHeartRateEvent } from './heartRateSerial'
import { createHeartRateStatsCollector } from './heartRateCollector'

const event = (bpm: number, seq: number): GatewayHeartRateEvent => ({
  v: 1,
  kind: 'heart_rate',
  boot_id: 'boot-1',
  run_id: 'run-1',
  source_key: 'cl830:000b738e',
  aliases: {
    be_decimal: '750478',
    be_decimal_min7: '0750478',
    le_decimal: '2389904128',
  },
  bpm,
  battery_percent: 81,
  seq,
  fresh: true,
})

describe('heart-rate stats collector', () => {
  it('accumulates samples without publishing mutable internal state', () => {
    const collector = createHeartRateStatsCollector()
    collector.begin()

    expect(collector.addSample(1, event(90, 1), 1_000)).toBe(true)
    const firstSnapshot = collector.snapshot()
    expect(firstSnapshot[1]).toMatchObject({ currentBpm: 90, sampleCount: 1 })

    expect(collector.addSample(1, event(110, 2), 1_250)).toBe(true)
    expect(firstSnapshot[1]).toMatchObject({ currentBpm: 90, sampleCount: 1 })
    expect(collector.snapshot()[1]).toMatchObject({
      currentBpm: 110,
      maxBpm: 110,
      minBpm: 90,
      totalBpm: 200,
      sampleCount: 2,
    })
    expect(collector.revision()).toBe(2)
  })

  it('freezes the final snapshot and ignores samples received after stop', () => {
    const collector = createHeartRateStatsCollector()
    collector.begin()
    collector.addSample(1, event(90, 1), 1_000)

    const finalSnapshot = collector.freeze()
    expect(collector.isCollecting()).toBe(false)
    expect(collector.addSample(1, event(120, 2), 1_100)).toBe(false)
    expect(finalSnapshot[1]).toMatchObject({ currentBpm: 90, sampleCount: 1 })
    expect(collector.snapshot()[1]).toMatchObject({ currentBpm: 90, sampleCount: 1 })
    expect(collector.revision()).toBe(1)
  })

  it('keeps student slots independent and clears all data for a new run', () => {
    const collector = createHeartRateStatsCollector()
    collector.begin()
    collector.addSample(1, event(90, 1), 1_000)
    collector.addSample(2, { ...event(75, 2), battery_percent: 64 }, 1_010)

    expect(Object.keys(collector.snapshot())).toEqual(['1', '2'])

    collector.begin()
    expect(collector.snapshot()).toEqual({})
    expect(collector.revision()).toBe(0)
    expect(collector.isCollecting()).toBe(true)

    collector.reset()
    expect(collector.isCollecting()).toBe(false)
    expect(collector.snapshot()).toEqual({})
  })

  it('retains every sample while thirty sensor slots are accumulated between UI flushes', () => {
    const collector = createHeartRateStatsCollector()
    collector.begin()

    for (let sequence = 1; sequence <= 3_000; sequence += 1) {
      const studentNumber = ((sequence - 1) % 30) + 1
      collector.addSample(studentNumber, event(70 + (sequence % 30), sequence), 1_000 + sequence)
    }

    const snapshot = collector.snapshot()
    expect(Object.keys(snapshot)).toHaveLength(30)
    expect(collector.revision()).toBe(3_000)
    for (let studentNumber = 1; studentNumber <= 30; studentNumber += 1) {
      expect(snapshot[studentNumber].sampleCount).toBe(100)
    }
  })

  it('ignores events until a measurement run begins', () => {
    const collector = createHeartRateStatsCollector()

    expect(collector.addSample(1, event(90, 1), 1_000)).toBe(false)
    expect(collector.snapshot()).toEqual({})
    expect(collector.revision()).toBe(0)
  })
})
