import { describe, expect, it } from 'vitest'

import {
  HeartRateMinutePoint,
  calculateSharedBpmScale,
  getHeartRateZone,
} from './heartRateVisualization'

const minutePoint = (
  averageBpm: number,
  isPartial = false,
): HeartRateMinutePoint => ({
  minuteIndex: 1,
  averageBpm,
  sampleCount: 12,
  isPartial,
})

describe('getHeartRateZone', () => {
  it('예측 최대심박 대비 4개 상대강도 구간을 구분한다', () => {
    expect(getHeartRateZone(127, 200)).toBe('low')
    expect(getHeartRateZone(128, 200)).toBe('moderate')
    expect(getHeartRateZone(154, 200)).toBe('high')
    expect(getHeartRateZone(192, 200)).toBe('near_max')
  })

  it('나이 기준이 없으면 중립색 구간을 사용한다', () => {
    expect(getHeartRateZone(130, null)).toBe('neutral')
  })
})

describe('calculateSharedBpmScale', () => {
  it('기본 범위 안의 측정만 있으면 60–160 BPM을 유지한다', () => {
    expect(calculateSharedBpmScale([minutePoint(80), minutePoint(130)])).toEqual({
      min: 60,
      max: 160,
    })
  })

  it('완료된 분 평균에 맞춰 10 BPM 단위로 공통 축을 확장한다', () => {
    expect(calculateSharedBpmScale([minutePoint(54), minutePoint(173)])).toEqual({
      min: 50,
      max: 180,
    })
  })

  it('부분 분과 장치 범위 밖 값으로는 축을 확장하지 않는다', () => {
    expect(calculateSharedBpmScale([
      minutePoint(45, true),
      minutePoint(39),
      minutePoint(221),
    ])).toEqual({ min: 60, max: 160 })
  })

  it('축은 장치 범위 40–220 BPM 안에서만 확장한다', () => {
    expect(calculateSharedBpmScale([minutePoint(40), minutePoint(220)])).toEqual({
      min: 40,
      max: 220,
    })
  })
})
