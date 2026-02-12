"use client"

import React, { useEffect, useMemo, useState, useRef } from 'react'

type ConnectionState = 'connecting' | 'open' | 'closed' | 'error' | 'idle' | 'app_launched'
type Gender = 'M' | 'F'

interface StudentRow {
  id: string
  grade: number
  class_no: number
  student_no: number
  name: string
  gender: Gender | null
  birth_date: string | null
  email: string | null
  height_cm: number | null
  weight_kg: number | null
  notes: string | null
}

interface HeartRateRow {
  student_id: string
  student_no: number
  name: string
  avg_bpm: (number | null)[]
  max_bpm: (number | null)[]
  min_bpm: (number | null)[]
}

interface StudentMapping {
  id: string
  no: number
  name: string
  device_id: string
}

const BRIDGE_URL = 'ws://localhost:8888'

export default function HeartRatePage() {
  // 학년도: 3~12월은 해당 연도, 1~2월은 전년도
  const computeDefaultYear = () => {
    const now = new Date()
    const m = now.getMonth() + 1
    return (m === 1 || m === 2) ? now.getFullYear() - 1 : now.getFullYear()
  }

  const [grade, setGrade] = useState<number>(1)
  const [classNo, setClassNo] = useState<number>(1)
  const [schoolType, setSchoolType] = useState<1 | 2 | 3>(1)
  const [year, setYear] = useState<number>(computeDefaultYear())

  const [students, setStudents] = useState<StudentRow[]>([])
  const [rows, setRows] = useState<HeartRateRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // WebSocket 연결 상태
  const [wsState, setWsState] = useState<ConnectionState>('idle')
  const [statusText, setStatusText] = useState<string>('대기 중')

  const [showAppModal, setShowAppModal] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const onChangeYear = (v: number) => { setYear(v) }
  const onChangeGrade = (v: number) => { setGrade(v) }
  const onChangeClassNo = (v: number) => { setClassNo(v) }

  useEffect(() => {
    const loadSchool = async () => {
      try {
        const res = await fetch('/api/school/info', { credentials: 'include' })
        const data = await res.json()
        if (res.ok && data?.school?.school_type) {
          const t = Number(data.school.school_type)
          if (t === 1 || t === 2 || t === 3) {
            setSchoolType(t as 1 | 2 | 3)
            setGrade((g) => {
              const maxG = t === 1 ? 6 : 3
              return Math.min(Math.max(1, g), maxG)
            })
            setClassNo((c) => Math.min(Math.max(1, c), 10))
          }
        }
      } catch { }
    }
    loadSchool()
  }, [])

  const fetchStudents = async () => {
    try {
      setError(null)
      const res = await fetch(`/api/school/students?year=${year}&grade=${grade}&class_no=${classNo}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '학생 조회 실패')
      setStudents(data.students as StudentRow[])
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
    }
  }

  useEffect(() => {
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, classNo, year])

  const fetchHeartRates = async (yearValue: number, studs: StudentRow[]) => {
    try {
      setError(null)
      const res = await fetch(`/api/school/heart-rate?grade=${grade}&class_no=${classNo}&year=${yearValue}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '심박수 기록 조회 실패')
      const apiRows = (data.rows || []) as HeartRateRow[]
      setRows(apiRows)
    } catch (e: unknown) {
      // 실패 시 빈 데이터로라도 렌더링되도록 학생 목록 기준으로 초기화
      const empty12 = Array.from({ length: 12 }, () => null as number | null)
      const mapped: HeartRateRow[] = studs
        .slice()
        .sort((a, b) => (a.student_no ?? 0) - (b.student_no ?? 0))
        .map(s => ({
          student_id: s.id,
          student_no: s.student_no,
          name: s.name,
          avg_bpm: [...empty12],
          max_bpm: [...empty12],
          min_bpm: [...empty12],
        }))
      setRows(mapped)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    if (students.length === 0) {
      setRows([])
      return
    }
    fetchHeartRates(year, students)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, year])

  // 학급 데이터 조회 및 전송
  const sendClassDataToApp = async () => {
    try {
      // 1. 심박계 매핑 조회
      const mappingsRes = await fetch('/api/school/heart-rate-mappings')
      if (!mappingsRes.ok) {
        throw new Error('하트 케어 매핑 조회 실패')
      }
      const mappingsData = await mappingsRes.json()
      const mappings = mappingsData.mappings || []

      // 2. 학생 데이터 구성 (1~30번 모두)
      const studentMappings: StudentMapping[] = []
      for (let i = 1; i <= 30; i++) {
        const student = students.find(s => s.student_no === i)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapping = mappings.find((m: any) => m.student_no === i)

        // 학생 정보가 있든 없든 모두 추가
        studentMappings.push({
          id: student ? student.id : '',
          no: i,
          name: student ? student.name : `${i}번 학생`,
          device_id: mapping ? mapping.device_id : ''
        })
      }

      // 3. WebSocket으로 학급 데이터 전송
      const classData = {
        grade: grade,
        class_no: classNo,
        students: studentMappings
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          command: 'set_class_data',
          data: classData
        }))
        const validCount = studentMappings.filter(s => s.device_id).length
        setStatusText(`${grade}학년 ${classNo}반 정보 전송 완료 (하트 케어 연결: ${validCount}명)`)
      } else {
        setStatusText('앱이 연결되지 않았습니다')
      }
    } catch (error) {
      console.error('학급 데이터 전송 오류:', error)
      setStatusText('학급 데이터 전송 실패')
    }
  }

  // 앱 실행
  const launchApp = () => {
    window.location.assign('fitness-bridge://start')
    setWsState('connecting')
    setStatusText('앱을 호출했습니다. 확인 중...')

    let isResolved = false

    const probe = () => {
      if (isResolved) return

      const checkWs = new WebSocket(BRIDGE_URL)
      checkWs.onopen = () => {
        if (!isResolved) {
          isResolved = true
          checkWs.close()
          setWsState('app_launched')
          setStatusText('앱 실행됨')
          cleanup()
          // 앱이 실행되면 자동으로 연결 시도
          setTimeout(connectToApp, 1000)
        }
      }
      checkWs.onerror = () => {
        checkWs.close()
      }
    }

    const intervalId = setInterval(probe, 1000)
    const onFocus = () => {
      setTimeout(probe, 500)
    }
    window.addEventListener('focus', onFocus)

    const safetyTimeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true
        setWsState('idle')
        setStatusText('앱이 실행되지 않았습니다.')
        setShowAppModal(true)
        cleanup()
      }
    }, 8000)

    const cleanup = () => {
      clearInterval(intervalId)
      clearTimeout(safetyTimeoutId)
      window.removeEventListener('focus', onFocus)
    }
  }

  // WebSocket 연결
  const connectToApp = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    setWsState('connecting')
    setStatusText('Heart Fit와 연결 중...')

    const ws = new WebSocket(BRIDGE_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setWsState('open')
      setStatusText('연결됨')

      // 연결되면 자동으로 학급 데이터 전송
      setTimeout(sendClassDataToApp, 500)
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        console.log('WebSocket 메시지:', msg)

        if (msg.type === 'session_result') {
          handleSaveSessionData(msg.data)
        }
      } catch (err) {
        console.error('메시지 파싱 오류:', err)
      }
    }

    ws.onerror = (e) => {
      console.error('WebSocket 오류:', e)
      setWsState('idle')
      setStatusText('연결 오류')
    }

    ws.onclose = () => {
      if (wsRef.current === ws) {
        setWsState('idle')
        setStatusText('대기 중')
        wsRef.current = null
      }
    }
  }

  // 세션 결과 저장 처리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSaveSessionData = async (results: any[]) => {
    try {
      setStatusText('데이터 저장 중...')
      const res = await fetch('/api/school/heart-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results,
          grade,
          class_no: classNo,
          year
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '데이터 저장 실패')

      setStatusText('측정 데이터가 서버에 저장되었습니다.')
      // 저장 성공 후 데이터 다시 불러오기
      fetchHeartRates(year, students)
    } catch (err: unknown) {
      const e = err as Error
      console.error('저장 중 오류:', e)
      setStatusText(`저장 실패: ${e.message}`)
    }
  }

  // 측정 시작 핸들러
  const handleStartMeasurement = () => {
    if (wsState === 'idle') {
      launchApp()
    } else if (wsState === 'app_launched' || wsState === 'closed' || wsState === 'error') {
      connectToApp()
    } else {
      setStatusText('이미 연결 중이거나 연결되어 있습니다')
    }
  }

  const monthOrderIdx = useMemo(() => [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1], [])
  const months = useMemo(() => monthOrderIdx.map((idx) => `${idx + 1}월`), [monthOrderIdx])
  const monthCellPx = 56 // 표 월별 셀 고정 폭(px)

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">심박수 기록 관리</h1>
        <a
          href="https://sxvtdnnzmvyksqqkidoi.supabase.co/storage/v1/object/public/apps/Heart%20Fit%20Setup.exe"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all font-semibold shadow-lg backdrop-blur-sm"
        >
          <svg className="w-5 h-5 text-indigo-300 group-hover:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Heart Fit 다운로드
        </a>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          {/* 좌측: 년도/학년/반 선택 */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-indigo-700 mb-1">년도</label>
              <select
                value={year}
                onChange={(e) => onChangeYear(Number(e.target.value))}
                className="block w-36 h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 hover:border-indigo-300 active:border-indigo-300"
              >
                {(() => {
                  const base = computeDefaultYear()
                  const years: number[] = []
                  for (let y = base + 1; y >= base - 5; y--) {
                    years.push(y)
                  }
                  return years.map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))
                })()}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-indigo-700 mb-1">학년</label>
              <select
                value={grade}
                onChange={(e) => onChangeGrade(Number(e.target.value))}
                className="block w-36 h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 hover:border-indigo-300 active:border-indigo-300"
              >
                {Array.from({ length: schoolType === 1 ? 6 : 3 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}학년</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-indigo-700 mb-1">반</label>
              <select
                value={classNo}
                onChange={(e) => onChangeClassNo(Number(e.target.value))}
                className="block w-36 h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 hover:border-indigo-300 active:border-indigo-300"
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}반</option>
                ))}
              </select>
            </div>
          </div>

          {/* 우측: 심박계 측정 시작 버튼 */}
          <div className="flex items-center gap-4">
            {statusText && <span className="text-sm font-bold text-indigo-600">{statusText}</span>}
            <button
              onClick={handleStartMeasurement}
              className={`
                relative flex items-center justify-center gap-3 px-8 py-4 rounded-xl 
                font-bold text-lg transition-all duration-300 shadow-xl active:scale-95
                ${wsState === 'idle'
                  ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white hover:shadow-indigo-500/30 hover:-translate-y-0.5'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-80 shadow-none'}
              `}
              disabled={wsState !== 'idle'}
            >
              {wsState === 'idle' ? (
                <>
                  <div className="flex items-center justify-center p-1 bg-white/20 rounded-full mr-1">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                    </span>
                  </div>
                  심박수 측정 시작하기
                </>
              ) : (
                <>
                  <div className="flex gap-1 items-center mr-1">
                    <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  </div>
                  실행 중
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6 text-gray-900">
        {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 w-16 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
                <th className="px-3 py-2 w-32 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                <th className="px-2 py-2 w-20 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                {months.map((m) => (
                  <th
                    key={m}
                    className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    style={{ width: monthCellPx }}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array.from({ length: 30 }).map((_, idx) => {
                const num = idx + 1
                const s = students.find(st => st.student_no === num) || null
                const r = rows.find(rr => rr.student_no === num) || null

                const avgBpm = r?.avg_bpm ?? Array.from({ length: 12 }, () => null as number | null)
                const maxBpm = r?.max_bpm ?? Array.from({ length: 12 }, () => null as number | null)
                const minBpm = r?.min_bpm ?? Array.from({ length: 12 }, () => null as number | null)
                const mergedRowSpan = 3

                return (
                  <React.Fragment key={num}>
                    <tr className=" bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center" rowSpan={mergedRowSpan}>{num}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center" rowSpan={mergedRowSpan}>
                        {s ? s.name : `${num}번 학생`}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-rose-700 font-semibold">최고 심박수</td>
                      {monthOrderIdx.map((origIdx, i) => {
                        const v = maxBpm[origIdx] as number | null
                        return <td key={i} className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-900" style={{ width: monthCellPx }}>{typeof v === 'number' ? v.toFixed(1) : '-'}</td>
                      })}
                    </tr>
                    <tr className="  bg-indigo-50">
                      <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-indigo-700 font-semibold">평균 심박수</td>
                      {monthOrderIdx.map((origIdx, i) => {
                        const v = avgBpm[origIdx] as number | null
                        return <td key={i} className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-900" style={{ width: monthCellPx }}>{typeof v === 'number' ? v.toFixed(1) : '-'}</td>
                      })}
                    </tr>
                    <tr className="  bg-teal-50">
                      <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-teal-700 font-semibold">최저 심박수</td>
                      {monthOrderIdx.map((origIdx, i) => {
                        const v = minBpm[origIdx] as number | null
                        return <td key={i} className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-900" style={{ width: monthCellPx }}>{typeof v === 'number' ? v.toFixed(1) : '-'}</td>
                      })}
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 앱 미설치 안내 모달 */}
      {showAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform transition-all animate-in fade-in zoom-in duration-300">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
              <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Heart Fit 앱이 없습니다.</h3>
            <p className="text-gray-500 mb-6">
              측정을 시작하려면 PC용 심박수 측정 프로그램을 설치하고 실행해야 합니다.
            </p>

            <button
              onClick={() => setShowAppModal(false)}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-200"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
