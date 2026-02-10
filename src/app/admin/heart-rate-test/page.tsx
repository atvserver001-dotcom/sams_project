'use client'

import React, { useEffect, useRef, useState, useMemo } from 'react'

type ConnectionState = 'connecting' | 'open' | 'closed' | 'error' | 'idle'

const BRIDGE_URL = 'ws://localhost:8888'

function fmtTime(iso?: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function fmtSensorId7(id?: string | null) {
  if (!id) return '-'
  const s = String(id).trim()
  if (!/^\d+$/.test(s)) return s
  if (s.length >= 7) return s
  return s.padStart(7, '0')
}

export default function HeartRateTestPage() {
  const [state, setState] = useState<ConnectionState>('idle')
  const [sessionActive, setSessionActive] = useState(false)
  const [statusText, setStatusText] = useState<string>('대기 중')

  const [currentBpm, setCurrentBpm] = useState<number | null>(null)
  const [lastTs, setLastTs] = useState<string | null>(null)

  const [samples, setSamples] = useState<Array<{
    ts: string;
    bpm: number | null;
    tech?: string;
    sensor_id?: string;
    battery_percent?: number | null;
    rssi?: number | null;
    raw: string
  }>>([])

  const [filterTech, setFilterTech] = useState<'all' | 'ANT' | 'BLE'>('all')
  const [filterSensor, setFilterSensor] = useState<string>('')
  const [sensorOrder, setSensorOrder] = useState<string[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)

  const connect = () => {
    disconnect()

    setState('connecting')
    setStatusText(`Fitness Bridge 연결 중... (${BRIDGE_URL})`)

    try {
      const ws = new WebSocket(BRIDGE_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setState('open')
        setStatusText('Fitness Bridge 연결됨')

        // 자동으로 세션 시작
        setTimeout(() => {
          startSession()
        }, 500)
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          handleFitnessBridgeMessage(msg)
        } catch (err) {
          console.error('메시지 파싱 오류:', err)
        }
      }

      ws.onerror = (e) => {
        console.error('WebSocket 오류:', e)
        setState('error')
        setStatusText('연결 오류 (Fitness Bridge 서버가 실행 중인지 확인하세요)')
      }

      ws.onclose = () => {
        setState('closed')
        setStatusText('연결 종료')
        setSessionActive(false)
        wsRef.current = null

        // 자동 재연결
        retryTimerRef.current = setTimeout(() => {
          connect()
        }, 3000)
      }
    } catch (err: unknown) {
      setState('error')
      const message = err instanceof Error ? err.message : String(err)
      setStatusText(`연결 실패: ${message}`)
    }
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    setState('idle')
    setStatusText('중지됨')
    setSessionActive(false)
  }

  const startSession = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'start_session' }))
      setStatusText('세션 시작 요청 전송')
    }
  }

  const stopSession = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'stop_session' }))
    }
  }

  interface FitnessBridgeMessage {
    type?: string
    sessionActive?: boolean
    message?: string
    dataType?: string
    data?: {
      heartRate?: number
      timestamp?: string
      deviceId?: string | number
      battery?: number
      [key: string]: unknown
    }
  }

  const handleFitnessBridgeMessage = (msg: FitnessBridgeMessage) => {
    const ts = new Date().toISOString()

    // 상태 메시지
    if (msg.type === 'status') {
      if (msg.sessionActive !== undefined) {
        setSessionActive(msg.sessionActive)
      }
      if (msg.message) {
        setStatusText(msg.message)
      }
      return
    }

    // 데이터 메시지
    if (msg.type === 'data' && msg.data) {
      const data = msg.data
      const dataType = msg.dataType

      // ANT+ 심박수
      if (dataType === 'ant_heartrate' && data.heartRate) {
        const sample = {
          ts: data.timestamp || ts,
          bpm: data.heartRate,
          tech: 'ANT',
          sensor_id: 'ANT+',
          raw: `ANT+ HR=${data.heartRate}`
        }

        setSamples(prev => [sample, ...prev].slice(0, 200))
        setCurrentBpm(data.heartRate)
        setLastTs(sample.ts)
      }

      // BLE 심박수
      else if (dataType === 'ble_heartrate' && data.heartRate) {
        const sample = {
          ts: data.timestamp || ts,
          bpm: data.heartRate,
          tech: 'BLE',
          sensor_id: data.deviceId ? String(data.deviceId) : 'BLE',
          battery_percent: data.battery,
          raw: `BLE HR=${data.heartRate}${data.battery ? ` Bat=${data.battery}%` : ''}`
        }

        setSamples(prev => [sample, ...prev].slice(0, 200))
        setCurrentBpm(data.heartRate)
        setLastTs(sample.ts)
      }

      // 허브 상태 (heartbeat)
      else if (dataType === 'heartbeat') {
        // 배터리 정보 등만 로그
        console.log('허브 상태:', data)
      }
    }
  }

  // 센서별 그룹화
  const groupedSensorsMap = useMemo(() => {
    const map = new Map<string, typeof samples[number]>()
    for (const s of samples) {
      const q = filterSensor.trim().toLowerCase()
      if (filterTech !== 'all' && (s.tech || '').toUpperCase() !== filterTech) continue
      if (q) {
        const hay = `${s.sensor_id || ''}`.toLowerCase()
        if (!hay.includes(q)) continue
      }

      const key = `${(s.tech || '-').toUpperCase()}|${s.sensor_id}`
      if (!map.has(key)) map.set(key, s)
    }
    return map
  }, [samples, filterTech, filterSensor])

  const groupedSensorsSortedKeys = useMemo(() => {
    const keys = Array.from(groupedSensorsMap.keys())
    return keys.sort((a, b) => {
      const [, aId] = a.split('|')
      const [, bId] = b.split('|')
      const an = Number(aId)
      const bn = Number(bId)
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn
      return a.localeCompare(b)
    })
  }, [groupedSensorsMap])

  useEffect(() => {
    setSensorOrder(prev => {
      if (prev.length === 0) return groupedSensorsSortedKeys
      const set = new Set(prev)
      const next = [...prev]
      for (const k of groupedSensorsSortedKeys) {
        if (!set.has(k)) {
          set.add(k)
          next.push(k)
        }
      }
      return next.filter(k => groupedSensorsMap.has(k))
    })
  }, [groupedSensorsSortedKeys, groupedSensorsMap])

  // 컴포넌트 언마운트 시 연결 정리
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  return (
    <div className="space-y-6 text-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">심박계 테스트 - Fitness Bridge</h1>
          <p className="mt-1 text-sm text-white/80">
            "시작" 버튼을 클릭하면 로컬 Fitness Bridge 서버에 연결되어 실시간 심박수 데이터를 수신합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${state === 'open' ? 'bg-emerald-100 text-emerald-800' :
            state === 'connecting' ? 'bg-indigo-100 text-indigo-800' :
              state === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-700'
            }`}>
            {state === 'open' ? '✅ 연결됨' :
              state === 'connecting' ? '🔄 연결 중...' :
                state === 'error' ? '❌ 오류' : '⚪ 대기'}
          </span>
          <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${sessionActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
            }`}>
            세션: {sessionActive ? '🟢 활성' : '⚪ 대기'}
          </span>
        </div>
      </div>

      {/* 상태 및 제어 */}
      <div className="bg-white/95 rounded-lg shadow p-6 space-y-4">
        {/* 연결 전 안내 메시지 */}
        {state === 'idle' && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">시작하기 전에</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>1. Fitness Bridge 서버가 실행 중인지 확인하세요</p>
                  <p className="mt-1 ml-4 font-mono text-xs bg-blue-100 px-2 py-1 rounded inline-block">
                    node index.js 또는 fitness-bridge.exe 실행
                  </p>
                  <p className="mt-2">2. 허브가 Fitness Bridge에 연결되어 있는지 확인하세요</p>
                  <p className="mt-2">3. 아래 "시작" 버튼을 클릭하세요</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 연결 실패 안내 메시지 */}
        {state === 'error' && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">연결 실패</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{statusText}</p>
                  <p className="mt-2 font-semibold">해결 방법:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Fitness Bridge가 실행 중인지 확인 (포트 8888)</li>
                    <li>방화벽이 WebSocket 연결을 차단하지 않는지 확인</li>
                    <li>다른 프로그램이 포트 8888을 사용하지 않는지 확인</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg">
            <div className="text-sm font-semibold text-indigo-700 mb-1">현재 심박수</div>
            <div className="text-4xl font-bold text-indigo-900">
              {currentBpm ? `${currentBpm}` : '-'}
              {currentBpm && <span className="text-lg ml-1">BPM</span>}
            </div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
            <div className="text-sm font-semibold text-purple-700 mb-1">수신 데이터</div>
            <div className="text-4xl font-bold text-purple-900">{samples.length}</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg">
            <div className="text-sm font-semibold text-pink-700 mb-1">마지막 업데이트</div>
            <div className="text-lg font-medium text-pink-900">{fmtTime(lastTs)}</div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            {statusText}
          </div>
          <div className="flex gap-2">
            {state === 'idle' || state === 'error' || state === 'closed' || state === 'connecting' ? (
              <button
                onClick={connect}
                disabled={state === 'connecting'}
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed shadow-md"
              >
                {state === 'connecting' ? '연결 중...' : '시작'}
              </button>
            ) : (
              <>
                {sessionActive ? (
                  <button
                    onClick={stopSession}
                    className="px-4 py-2 rounded bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"
                  >
                    세션 중지
                  </button>
                ) : (
                  <button
                    onClick={startSession}
                    disabled={state !== 'open'}
                    className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    세션 시작
                  </button>
                )}
                <button
                  onClick={disconnect}
                  className="px-4 py-2 rounded bg-gray-600 text-white text-sm font-medium hover:bg-gray-700"
                >
                  중지
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 센서 데이터 테이블 */}
      <div className="bg-white/95 rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">수신 데이터</h2>

        <div className="mb-4 flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">필터:</span>
            <select
              value={filterTech}
              onChange={e => setFilterTech(e.target.value as 'all' | 'ANT' | 'BLE')}
              className="border-gray-300 rounded h-8 text-xs"
            >
              <option value="all">전체</option>
              <option value="ANT">ANT+</option>
              <option value="BLE">BLE</option>
            </select>
          </label>
          <input
            value={filterSensor}
            onChange={e => setFilterSensor(e.target.value)}
            placeholder="센서 ID 검색..."
            className="border-gray-300 rounded h-8 px-2 text-xs flex-1 max-w-xs"
          />
          <div className="ml-auto">
            <button
              onClick={() => setSamples([])}
              className="px-3 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300"
            >
              초기화
            </button>
          </div>
        </div>

        <div className="overflow-auto border border-gray-200 rounded" style={{ maxHeight: '500px' }}>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2">기술</th>
                <th className="px-3 py-2">센서 ID</th>
                <th className="px-3 py-2">심박수 (BPM)</th>
                <th className="px-3 py-2">배터리(%)</th>
                <th className="px-3 py-2">마지막 업데이트</th>
              </tr>
            </thead>
            <tbody>
              {sensorOrder.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    데이터가 없습니다
                  </td>
                </tr>
              ) : (
                sensorOrder.map(k => {
                  const s = groupedSensorsMap.get(k)
                  if (!s) return null
                  return (
                    <tr key={k} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${s.tech === 'ANT' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                          {s.tech}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{fmtSensorId7(s.sensor_id)}</td>
                      <td className="px-3 py-2">
                        <span className="font-bold text-lg text-indigo-900">{s.bpm ?? '-'}</span>
                      </td>
                      <td className="px-3 py-2">{s.battery_percent ?? '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{fmtTime(s.ts)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          💡 Fitness Bridge 서버가 실행 중이어야 하며, 허브가 서버에 연결되어 있어야 합니다.
        </div>
      </div>
    </div>
  )
}
