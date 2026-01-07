'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type StreamMessage = {
  type: 'open' | 'data' | 'error' | 'close'
  ts: string
  bpm?: number | null
  tech?: 'ANT' | 'BLE' | 'HUB'
  sensor_id?: string
  sensor_id_number?: number | null
  model?: string
  device_id?: string
  ant_id?: string
  ant_device_number?: number | null
  ant_device_id?: number | null
  ant_device_id_hex?: string
  battery_raw?: number | null
  rssi?: number | null
  hub_id?: number | null
  hub_mac?: string
  battery_percent?: number | null
  ble_device_id_hex?: string
  ble_adv_type?: number | null
  ble_battery?: number | null
  ble_steps?: number | null
  ble_calories?: number | null
  ble_temperature_c?: number | null
  ble_oxygen?: number | null
  comm_flags?: string
  msg_type?: string
  seq?: number
  raw?: string
  message?: string
}

type ConnectionState = 'connecting' | 'open' | 'closed' | 'error' | 'idle'

function isStreamMessage(v: unknown): v is StreamMessage {
  if (!v || typeof v !== 'object') return false
  const t = (v as { type?: unknown }).type
  return t === 'open' || t === 'data' || t === 'error' || t === 'close'
}

function fmtTime(iso?: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function fmtSensorId7(id?: string | null) {
  if (!id) return '-'
  const s = String(id).trim()
  if (!/^\d+$/.test(s)) return s
  if (s.length >= 7) return s
  return s.padStart(7, '0')
}

export default function HeartRateTestPage() {
  const [mode, setMode] = useState<'listen' | 'connect'>('connect')
  const [protocol, setProtocol] = useState<'tcp' | 'udp' | 'ws'>('tcp')

  // connect 모드: 허브로 접속 (허브 IP는 앱 화면에 표시된 WiFi address 참고)
  const [hubHost, setHubHost] = useState('192.168.0.33')
  const [hubPort, setHubPort] = useState<number>(8088)
  const [wsPath, setWsPath] = useState('/')

  // PC가 허브 데이터를 받기 위해 TCP 서버로 리스닝할 바인드 주소
  // 0.0.0.0 으로 두면 192.168.0.28 같은 로컬 IP로 들어오는 연결도 수신 가능
  const [host, setHost] = useState('0.0.0.0')
  const [port, setPort] = useState<number>(8088)
  const [autoConnect, setAutoConnect] = useState(true)

  const [state, setState] = useState<ConnectionState>('idle')
  const [statusText, setStatusText] = useState<string>('대기 중')

  const [currentBpm, setCurrentBpm] = useState<number | null>(null)
  const [lastTs, setLastTs] = useState<string | null>(null)
  const [samples, setSamples] = useState<Array<{ ts: string; bpm: number | null; tech?: string; hub_mac?: string; sensor_id?: string; sensor_id_number?: number | null; battery_percent?: number | null; rssi?: number | null; raw: string }>>([])
  const [showBleHexLogs, setShowBleHexLogs] = useState(false)
  const [bleHexLogs, setBleHexLogs] = useState<string[]>([])
  const showBleHexLogsRef = useRef(false)

  const [filterTech, setFilterTech] = useState<'all' | 'ANT' | 'BLE'>('all')
  const [filterSensor, setFilterSensor] = useState<string>('')
  // 기기별 최신값(그룹) 테이블의 고정 순서 유지용
  const [sensorOrder, setSensorOrder] = useState<string[]>([])

  const eventSourceRef = useRef<EventSource | null>(null)
  const connectingKeyRef = useRef(0)

  useEffect(() => {
    showBleHexLogsRef.current = showBleHexLogs
  }, [showBleHexLogs])

  const url = useMemo(() => {
    const qs = new URLSearchParams()
    qs.set('mode', mode)
    qs.set('proto', protocol)

    if (mode === 'connect') {
      qs.set('hubHost', hubHost.trim())
      qs.set('hubPort', String(hubPort || 8088))
      qs.set('wsPath', wsPath || '/')
    } else {
      qs.set('host', host.trim() || '0.0.0.0')
      qs.set('port', String(port || 8088))
    }
    return `/api/admin/heart-rate-test/stream?${qs.toString()}`
  }, [mode, protocol, hubHost, hubPort, wsPath, host, port])

  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState('closed')
    setStatusText('연결 종료됨')
  }

  const connect = () => {
    // 중복 연결 방지
    disconnect()

    connectingKeyRef.current += 1
    const myKey = connectingKeyRef.current

    setState('connecting')
    setStatusText(`연결 중... (${host}:${port})`)

    const es = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = es

    es.onmessage = (evt) => {
      if (myKey !== connectingKeyRef.current) return
      const fallback: StreamMessage = { type: 'data', ts: new Date().toISOString(), raw: String(evt.data) }
      let msg: StreamMessage = fallback
      try {
        const parsed: unknown = JSON.parse(evt.data)
        msg = isStreamMessage(parsed) ? parsed : fallback
      } catch {
        msg = fallback
      }

      if (msg.type === 'open') {
        setState('open')
        setStatusText(msg.message || '연결됨')
        return
      }

      if (msg.type === 'error') {
        setState('error')
        setStatusText(msg.message || '오류')
        return
      }

      if (msg.type === 'close') {
        setState('closed')
        setStatusText(msg.message || '연결 종료')
        return
      }

      // data
      const bpm = typeof msg.bpm === 'number' ? msg.bpm : null
      const raw = (msg.raw ?? '').toString()
      const hubMac = msg.hub_mac
      const sensorId = msg.sensor_id || msg.ant_id || msg.ant_device_id_hex || msg.ble_device_id_hex
      const sensorIdNumber = typeof msg.sensor_id_number === 'number' ? msg.sensor_id_number : null
      const battery = typeof msg.battery_percent === 'number' ? msg.battery_percent : (msg.battery_percent ?? null)
      const rssi = typeof msg.rssi === 'number' ? msg.rssi : (msg.rssi ?? null)
      // 센서 ID 없는 데이터는 표시/저장하지 않음
      if (!sensorIdNumber && !sensorId) return

      if (showBleHexLogsRef.current && (msg.tech || '').toUpperCase() === 'BLE' && raw) {
        setBleHexLogs((prev) => {
          const next = [`${fmtTime(msg.ts)} - ${raw}`, ...prev]
          return next.slice(0, 120)
        })
      }
      setCurrentBpm(bpm)
      setLastTs(msg.ts || new Date().toISOString())
      setSamples((prev) => {
        const next = [{
          ts: msg.ts || new Date().toISOString(),
          bpm,
          tech: msg.tech,
          hub_mac: hubMac,
          sensor_id: sensorIdNumber ? String(sensorIdNumber) : sensorId,
          sensor_id_number: sensorIdNumber,
          battery_percent: battery,
          rssi,
          raw
        }, ...prev]
        return next.slice(0, 200)
      })
    }

    es.onerror = () => {
      if (myKey !== connectingKeyRef.current) return
      setState('error')
      setStatusText('SSE 연결 오류 (서버/API 또는 8088 포트 확인)')
    }
  }

  useEffect(() => {
    if (!autoConnect) return
    connect()
    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, url])

  const stateBadge = useMemo(() => {
    const base = 'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold'
    switch (state) {
      case 'open':
        return `${base} bg-emerald-100 text-emerald-800`
      case 'connecting':
        return `${base} bg-indigo-100 text-indigo-800`
      case 'error':
        return `${base} bg-rose-100 text-rose-800`
      case 'closed':
        return `${base} bg-gray-200 text-gray-800`
      default:
        return `${base} bg-gray-100 text-gray-700`
    }
  }, [state])

  const filteredSamples = useMemo(() => {
    const q = filterSensor.trim().toLowerCase()
    return samples.filter((s) => {
      // 센서 ID 없는 데이터는 아예 제외
      if (!s.sensor_id) return false
      if (filterTech !== 'all') {
        if ((s.tech || '').toUpperCase() !== filterTech) return false
      }
      if (q) {
        const hay = `${s.sensor_id || ''} ${(s.hub_mac || '')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [samples, filterTech, filterSensor])

  const groupedSensorsMap = useMemo(() => {
    // tech+sensor_id 기준 최신 1건만 유지 (filteredSamples는 최신순으로 쌓임)
    const map = new Map<string, typeof filteredSamples[number]>()
    for (const s of filteredSamples) {
      const key = `${(s.tech || '-').toUpperCase()}|${s.sensor_id}`
      if (!map.has(key)) map.set(key, s)
    }
    return map
  }, [filteredSamples])

  const groupedSensorsSortedKeys = useMemo(() => {
    // 최초 진입 시: 센서ID(숫자) 기준 정렬(문자열 숫자이므로 Number 처리)
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
    // 순서 고정:
    // - 처음에는 센서ID 기준 정렬 순서로 세팅
    // - 이후에는 새로운 센서가 생기면 맨 뒤에만 추가 (기존 순서는 유지)
    setSensorOrder((prev) => {
      if (prev.length === 0) return groupedSensorsSortedKeys
      const set = new Set(prev)
      const next = [...prev]
      for (const k of groupedSensorsSortedKeys) {
        if (!set.has(k)) {
          set.add(k)
          next.push(k)
        }
      }
      // 더 이상 존재하지 않는 센서는 제거(필터 변경 포함)
      return next.filter((k) => groupedSensorsMap.has(k))
    })
  }, [groupedSensorsSortedKeys, groupedSensorsMap])

  return (
    <div className="space-y-6 text-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">심박계(테스트)</h1>
          <p className="mt-1 text-sm text-white/80">
            iPad 앱 대신 이 페이지에서 허브 데이터를 표시합니다. 허브가 <span className="font-semibold">TCP/WebSocket 서버로 제공</span>하는 경우에는
            <span className="font-semibold"> “허브 접속”</span> 모드로, 허브가 <span className="font-semibold">PC로 푸시(TCP/UDP)</span>하는 경우에는
            <span className="font-semibold"> “PC 리스닝”</span> 모드로 설정하세요.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={stateBadge}>
            {state === 'open' ? '연결됨' : state === 'connecting' ? '연결 중' : state === 'error' ? '오류' : state === 'closed' ? '종료' : '대기'}
          </span>
        </div>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">모드</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="connect">허브 접속(PC→허브)</option>
              <option value="listen">PC 리스닝(허브→PC)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">프로토콜</label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as any)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="tcp">TCP</option>
              <option value="udp" disabled={mode === 'connect'}>UDP (PC 리스닝 전용)</option>
              <option value="ws" disabled={mode === 'listen'}>WebSocket (허브 접속 전용)</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={connect}
              className="h-10 px-4 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              연결/재연결
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="h-10 px-4 rounded bg-gray-700 text-white text-sm font-medium hover:bg-gray-800"
            >
              중지
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mode === 'connect' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-indigo-700 mb-1">Hub IP (WiFi address)</label>
                <input
                  value={hubHost}
                  onChange={(e) => setHubHost(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  placeholder="예: 192.168.0.33"
                />
                <div className="mt-1 text-[11px] text-gray-500">
                  앱 화면의 WiFi address 값을 넣으세요 (현재 예시: <span className="font-semibold">192.168.0.33</span>)
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-indigo-700 mb-1">Hub Port</label>
                <input
                  type="number"
                  value={hubPort}
                  onChange={(e) => setHubPort(Number(e.target.value) || 8088)}
                  className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  placeholder="8088"
                />
                {protocol === 'ws' && (
                  <div className="mt-2">
                    <label className="block text-xs font-semibold text-indigo-700 mb-1">WebSocket Path</label>
                    <input
                      value={wsPath}
                      onChange={(e) => setWsPath(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                      placeholder="/"
                    />
                    <div className="mt-1 text-[11px] text-gray-500">기본은 <span className="font-semibold">/</span> 입니다.</div>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-700 md:col-span-1">
                <div className="text-xs text-gray-500">
                  접속 대상: <span className="font-semibold">{protocol === 'ws' ? `ws://${hubHost}:${hubPort}${wsPath || '/'}` : `${hubHost}:${hubPort}`}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-indigo-700 mb-1">Bind Host</label>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  placeholder="0.0.0.0"
                />
                <div className="mt-1 text-[11px] text-gray-500">
                  권장: <span className="font-semibold">0.0.0.0</span> (모든 로컬 인터페이스에서 수신)
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-indigo-700 mb-1">Bind Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value) || 8088)}
                  className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  placeholder="8088"
                />
              </div>
              <div className="text-sm text-gray-700 md:col-span-1">
                <div className="text-xs text-gray-500">
                  허브에서 전송할 주소: <span className="font-semibold">{`192.168.0.28:${port}`}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-gray-700">
            <div className="font-medium">상태: <span className="font-normal">{statusText}</span></div>
            <div className="text-xs text-gray-500">마지막 수신: {fmtTime(lastTs)}</div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              checked={autoConnect}
              onChange={(e) => setAutoConnect(e.target.checked)}
              className="rounded border-gray-300"
            />
            자동 연결
          </label>
        </div>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">기기별 최신값</h2>
            <div className="mt-1 text-xs text-gray-500">
              센서ID 기준으로 최신 값만 표시합니다. 센서 순서는 고정되어 “왔다갔다”하지 않습니다.
            </div>
          </div>
          <div className="text-sm text-gray-700 text-right">
            <div className="font-medium">현재 심박: <span className="font-semibold">{currentBpm == null ? '-' : currentBpm}</span> bpm</div>
            <div className="text-xs text-gray-500">마지막 수신: {fmtTime(lastTs)}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">종류</label>
            <select
              value={filterTech}
              onChange={(e) => setFilterTech(e.target.value as any)}
              className="w-full h-9 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="all">전체</option>
              <option value="ANT">ANT</option>
              <option value="BLE">BLE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">센서 검색</label>
            <input
              value={filterSensor}
              onChange={(e) => setFilterSensor(e.target.value)}
              className="w-full h-9 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              placeholder="예: 202542"
            />
          </div>
          <div className="flex items-end justify-end">
            <button
              type="button"
              onClick={() => setSamples([])}
              className="h-9 px-3 rounded bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
            >
              캐시/목록 초기화
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              checked={showBleHexLogs}
              onChange={(e) => {
                setShowBleHexLogs(e.target.checked)
                if (!e.target.checked) setBleHexLogs([])
              }}
              className="rounded border-gray-300"
            />
            BLE HEX 로그 보기(디버그)
          </label>
          {showBleHexLogs && (
            <button
              type="button"
              onClick={() => setBleHexLogs([])}
              className="h-8 px-3 rounded bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
            >
              로그 비우기
            </button>
          )}
        </div>

        {showBleHexLogs && (
          <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs text-gray-600 mb-2">
              BLE 수신 패킷(pkt) + merge 프레임의 HEX preview를 표시합니다. (최신 120줄)
            </div>
            <textarea
              readOnly
              value={bleHexLogs.join('\n\n')}
              className="w-full h-56 font-mono text-[11px] leading-relaxed p-2 rounded border border-gray-200 bg-white text-gray-800"
            />
          </div>
        )}

        <div className="mt-4 rounded border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 w-[60px]">종류</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 w-[140px]">센서 ID(숫자)</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 w-[70px]">bpm</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 w-[80px]">배터리</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 w-[80px]">RSSI</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 w-[180px]">마지막</th>
              </tr>
            </thead>
            <tbody>
              {sensorOrder.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">표시할 기기가 없습니다.</td>
                </tr>
              ) : (
                sensorOrder.map((k) => {
                  const s = groupedSensorsMap.get(k)
                  if (!s) return null
                  return (
                    <tr key={k} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-xs text-gray-700">{s.tech || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{fmtSensorId7(s.sensor_id)}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900">{s.bpm == null ? '-' : s.bpm}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{typeof s.battery_percent === 'number' ? `${s.battery_percent}%` : '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{typeof s.rssi === 'number' ? s.rssi : '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtTime(s.ts)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}


