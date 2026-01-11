"use client"

import React, { useEffect, useMemo, useState } from 'react'

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

type ViewMode = 'data' | 'chart'

type CategoryFilter = 'all' | 1 | 2 | 3 | 4

interface ExerciseRow {
  student_id: string
  student_no: number
  name: string
  minutes: (number | null)[]
  avg_bpm: (number | null)[]
  max_bpm: (number | null)[]
  accuracy?: (number | null)[]
  calories?: (number | null)[]
  minutes_c1?: (number | null)[]
  minutes_c2?: (number | null)[]
  minutes_c3?: (number | null)[]
}

export default function ExercisesPage() {
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
  const [category, setCategory] = useState<CategoryFilter>('all')

  const [students, setStudents] = useState<StudentRow[]>([])
  const [rows, setRows] = useState<ExerciseRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<ViewMode>('data')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  const onChangeYear = (v: number) => { setYear(v) }
  const onChangeGrade = (v: number) => { setGrade(v) }
  const onChangeClassNo = (v: number) => { setClassNo(v) }
  const onChangeCategory = (v: CategoryFilter) => { setCategory(v) }

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
    } catch (e: any) {
      setError(e.message)
    } finally {

    }
  }

  useEffect(() => {
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, classNo, year])

  const fetchExercises = async (yearValue: number, studs: StudentRow[]) => {
    try {
      setError(null)
      setTooltip(null)
      const ctParam = category === 'all' ? 'all' : String(category)
      const res = await fetch(`/api/school/exercises?grade=${grade}&class_no=${classNo}&year=${yearValue}&category_type=${ctParam}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '운동 기록 조회 실패')
      const apiRows = (data.rows || []) as ExerciseRow[]
      setRows(apiRows)
    } catch (e: any) {
      // 실패 시 빈 데이터로라도 렌더링되도록 학생 목록 기준으로 초기화
      const empty12 = Array.from({ length: 12 }, () => null as number | null)
      const mapped: ExerciseRow[] = studs
        .slice()
        .sort((a, b) => (a.student_no ?? 0) - (b.student_no ?? 0))
        .map(s => ({
          student_id: s.id,
          student_no: s.student_no,
          name: s.name,
          minutes: [...empty12],
          avg_bpm: [...empty12],
          max_bpm: [...empty12],
          accuracy: [...empty12],
          calories: [...empty12],
          minutes_c1: [...empty12],
          minutes_c2: [...empty12],
          minutes_c3: [...empty12],
        }))
      setRows(mapped)
      setError(e.message)
    } finally {

    }
  }

  useEffect(() => {
    if (students.length === 0) {
      setRows([])
      return
    }
    fetchExercises(year, students)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, year, category])

  const monthOrderIdx = useMemo(() => [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1], [])
  const months = useMemo(() => monthOrderIdx.map((idx) => `${idx + 1}월`), [monthOrderIdx])
  const monthCellPx = 56 // 표 월별 셀 고정 폭(px)
  const contentKey = useMemo(() => `${year}-${grade}-${classNo}-${String(category)}`, [year, grade, classNo, category])



  // 칼로리는 서버 record_type=5 값을 그대로 사용

  const minutesMax = useMemo(() => {
    const vals: number[] = []
    for (const r of rows) {
      for (const v of r.minutes) if (typeof v === 'number') vals.push(v)
    }
    const max = vals.length ? Math.max(...vals) : 0
    return max || 1
  }, [rows])

  const caloriesMax = useMemo(() => {
    const vals: number[] = []
    for (const r of rows) {
      const calArr = r?.calories ?? Array.from({ length: 12 }, () => null as number | null)
      for (const v of calArr) if (typeof v === 'number') vals.push(v)
    }
    const max = vals.length ? Math.max(...vals) : 0
    return max || 1
  }, [rows])

  const bpmMax = useMemo(() => {
    const vals: number[] = []
    for (const r of rows) {
      for (const v of r.avg_bpm) if (typeof v === 'number') vals.push(v)
      for (const v of r.max_bpm) if (typeof v === 'number') vals.push(v)
    }
    const max = vals.length ? Math.max(...vals) : 0
    return max || 1
  }, [rows])



  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">운동 기록 관리</h1>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6">
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
      </div>

      {/* 운동종류 / 데이터-그래프 토글: 위치 이동 (필터 패널과 리스트 사이) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 운동종류 카테고리 */}
        <div className="inline-flex rounded-full overflow-hidden border border-white/70 shadow">
          <button
            onClick={() => onChangeCategory('all')}
            className={`px-4 py-2 text-sm font-semibold transition ${category === 'all' ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            전체
          </button>
          <button
            onClick={() => onChangeCategory(1)}
            className={`px-4 py-2 text-sm font-semibold transition ${category === 1 ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            근력.근지구력운동
          </button>
          <button
            onClick={() => onChangeCategory(2)}
            className={`px-4 py-2 text-sm font-semibold transition ${category === 2 ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            심폐지구력운동
          </button>
          <button
            onClick={() => onChangeCategory(3)}
            className={`px-4 py-2 text-sm font-semibold transition ${category === 3 ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            유연성운동
          </button>
        </div>

        {/* 데이터/그래프 토글 */}
        <div className="inline-flex rounded-full overflow-hidden border border-white/70 shadow">
          <button
            onClick={() => setView('data')}
            className={`px-4 py-2 text-sm font-semibold transition ${view === 'data' ? 'bg-cyan-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            데이터
          </button>
          <button
            onClick={() => setView('chart')}
            className={`px-4 py-2 text-sm font-semibold transition ${view === 'chart' ? 'bg-cyan-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            그래프
          </button>
        </div>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6 text-gray-900">
        {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

        {view === 'data' ? (
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

                  const minutes = r?.minutes ?? Array.from({ length: 12 }, () => null as number | null)
                  const accArr = r?.accuracy ?? Array.from({ length: 12 }, () => null as number | null)
                  const extraRows = 1 /* accuracy */ + 1 /* calories */
                  const mergedRowSpan = 3 + extraRows

                  return (
                    <React.Fragment key={num}>
                      <tr className=" bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center" rowSpan={mergedRowSpan}>{num}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center" rowSpan={mergedRowSpan}>
                          {s ? s.name : `${num}번 학생`}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-indigo-700 font-semibold">운동시간</td>
                        {monthOrderIdx.map((origIdx, i) => {
                          const v = minutes[origIdx] as number | null
                          return <td key={i} className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-900" style={{ width: monthCellPx }}>{typeof v === 'number' ? v.toFixed(1) : '-'}</td>
                        })}
                      </tr>
                      <tr className="  bg-teal-50">
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-teal-700 font-semibold">정확도</td>
                        {monthOrderIdx.map((origIdx, i) => {
                          const v = accArr[origIdx] as number | null
                          return <td key={i} className="px-2 py-2 whitespace-nowrap text-xs text-center text-gray-500" style={{ width: monthCellPx }}>{v ?? '-'}</td>
                        })}
                      </tr>
                      <tr className="  bg-violet-50">
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-violet-700 font-semibold">평균 bpm</td>
                        {monthOrderIdx.map((origIdx, i) => {
                          const v = (r?.avg_bpm ?? Array.from({ length: 12 }, () => null as number | null))[origIdx] as number | null
                          return <td key={i} className="px-2 py-2 whitespace-nowrap text-xs text-center text-gray-500" style={{ width: monthCellPx }}>{v ?? '-'}</td>
                        })}
                      </tr>
                      <tr className="  bg-rose-50">
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-rose-700 font-semibold">최대 bpm</td>
                        {monthOrderIdx.map((origIdx, i) => {
                          const v = (r?.max_bpm ?? Array.from({ length: 12 }, () => null as number | null))[origIdx] as number | null
                          return <td key={i} className="px-2 py-2 whitespace-nowrap text-xs text-center text-gray-500" style={{ width: monthCellPx }}>{v ?? '-'}</td>
                        })}
                      </tr>
                      <tr className="  bg-yellow-50">
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-center text-yellow-700 font-semibold">칼로리</td>
                        {(() => {
                          const calArr = r?.calories ?? Array.from({ length: 12 }, () => null as number | null)
                          return monthOrderIdx.map((origIdx, i) => {
                            const v = calArr[origIdx] as number | null
                            const display = typeof v === 'number' ? v.toFixed(1) : '-'
                            return <td key={i} className="px-2 py-2 whitespace-nowrap text-xs text-center text-gray-500" style={{ width: monthCellPx }}>{display}</td>
                          })
                        })()}
                      </tr>
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4" key={contentKey}>
            {Array.from({ length: 30 }).map((_, idx) => {
              const num = idx + 1
              const s = students.find(st => st.student_no === num) || null
              const r = rows.find(rr => rr.student_no === num) || null
              const minutesDataRaw = r?.minutes ?? Array.from({ length: 12 }, () => null as number | null)
              const avgDataRaw = r?.avg_bpm ?? Array.from({ length: 12 }, () => null as number | null)
              const maxDataRaw = r?.max_bpm ?? Array.from({ length: 12 }, () => null as number | null)
              const calDataRaw = r?.calories ?? Array.from({ length: 12 }, () => null as number | null)
              const mC1Raw = r?.minutes_c1 ?? Array.from({ length: 12 }, () => null as number | null)
              const mC2Raw = r?.minutes_c2 ?? Array.from({ length: 12 }, () => null as number | null)
              const mC3Raw = r?.minutes_c3 ?? Array.from({ length: 12 }, () => null as number | null)
              const minutesDataRawOrdered = monthOrderIdx.map((idx) => minutesDataRaw[idx] as number | null)
              const avgDataRawOrdered = monthOrderIdx.map((idx) => avgDataRaw[idx] as number | null)
              const maxDataRawOrdered = monthOrderIdx.map((idx) => maxDataRaw[idx] as number | null)
              const calDataRawOrdered = monthOrderIdx.map((idx) => calDataRaw[idx] as number | null)
              const mC1Ordered = monthOrderIdx.map((idx) => mC1Raw[idx] as number | null)
              const mC2Ordered = monthOrderIdx.map((idx) => mC2Raw[idx] as number | null)
              const mC3Ordered = monthOrderIdx.map((idx) => mC3Raw[idx] as number | null)
              const minutesData = minutesDataRawOrdered.map((v: number | null) => (typeof v === 'number' ? v : 0))
              const avgData = avgDataRawOrdered.map((v: number | null) => (typeof v === 'number' ? v : 0))
              const maxData = maxDataRawOrdered.map((v: number | null) => (typeof v === 'number' ? v : 0))
              const calData = calDataRawOrdered.map((v: number | null) => (typeof v === 'number' ? v : 0))
              const mC1 = mC1Ordered.map((v: number | null) => (typeof v === 'number' ? v : 0))
              const mC2 = mC2Ordered.map((v: number | null) => (typeof v === 'number' ? v : 0))
              const mC3 = mC3Ordered.map((v: number | null) => (typeof v === 'number' ? v : 0))

              const width = 500
              const height = 80
              const barW = Math.max(2, Math.floor((width - 24) / 12))
              const gap = Math.max(2, Math.floor((width - 24 - barW * 12) / 11))



              // 카테고리별 공통: 운동시간 바 차트 + BPM 라인 오버레이
              return (
                <div key={num} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">
                      {num}. {s ? s.name : `${num}번 학생`}
                    </div>

                  </div>
                  <div className="flex items-center gap-10 justify-center">
                    {/* 왼쪽: 운동시간 바 차트 (카테고리≠전체일 때 정확도 캡 오버레이) */}
                    <div>
                      <div className="mb-1 text-xs text-gray-600 flex items-center gap-3">
                        {category !== 'all' ? (
                          <>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-2 rounded-sm bg-indigo-400" /> 운동시간</span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-2 rounded-sm bg-teal-600" /> 정확도</span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-2 rounded-sm bg-yellow-500" /> 칼로리</span>
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-2 rounded-sm bg-[#2563eb]" /> 근력</span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-2 rounded-sm bg-[#16a34a]" /> 지구력</span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-2 rounded-sm bg-[#ec4899]" /> 유연성</span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-2 rounded-sm bg-yellow-500" /> 칼로리</span>
                          </>
                        )}
                      </div>
                      <svg width={width} height={height} className="block">
                        {minutesData.map((v, i) => {
                          const h = minutesMax > 0 ? Math.round((v / minutesMax) * (height - 6)) : 0
                          const x = 12 + i * (barW + gap)
                          const y = height - 3 - h
                          const accVal = r?.accuracy?.[monthOrderIdx[i]]
                          const rawMinutesVal = r?.minutes?.[monthOrderIdx[i]]
                          const accText = category !== 'all' ? ` / 정확도 ${typeof accVal === 'number' ? accVal : '-'}%` : ''
                          const calVal = calData[i]
                          const calH = caloriesMax > 0 ? Math.round((calVal / caloriesMax) * (height - 6)) : 0
                          const minutesBarW = Math.max(2, Math.floor(barW * 0.85))
                          const calBarW = Math.max(0, barW - minutesBarW)
                          const minutesX = x
                          const calX = x + minutesBarW
                          return (
                            <g key={i}>
                              {category === 'all' ? (() => {
                                const total = v
                                const c1 = mC1[i]
                                const c2 = mC2[i]
                                const c3 = mC3[i]
                                const h1 = Math.round(h * (total > 0 ? c1 / total : 0))
                                const h2 = Math.round(h * (total > 0 ? c2 / total : 0))
                                const h3 = Math.max(0, h - h1 - h2)
                                let yCursor = height - 3 - h
                                const parts: { h: number; color: string; label: string }[] = [
                                  { h: h1, color: '#2563eb', label: '근력' },
                                  { h: h2, color: '#16a34a', label: '심폐' },
                                  { h: h3, color: '#ec4899', label: '유연성' },
                                ]
                                return (
                                  <g>
                                    {parts.map((p, idx2) => {
                                      const rectEl = (
                                        <rect
                                          key={`stack-${idx2}`}
                                          x={minutesX}
                                          y={yCursor}
                                          width={minutesBarW}
                                          height={p.h}
                                          rx={1}
                                          style={{ fill: p.color }}
                                          opacity={(r?.minutes?.[monthOrderIdx[i]] ?? null) == null ? 0.25 : 1}
                                          onMouseEnter={(e) => setTooltip({ x: e.clientX + 12, y: e.clientY + 12, content: `${num}. ${(s?.name) ?? '-'} · ${monthOrderIdx[i] + 1}월 ${p.label} ${(() => { const segVal = idx2 === 0 ? c1 : idx2 === 1 ? c2 : c3; return typeof segVal === 'number' ? segVal.toFixed(1) : '-' })()}분 / 총 ${typeof (r?.minutes?.[monthOrderIdx[i]]) === 'number' ? (r?.minutes?.[monthOrderIdx[i]] as number).toFixed(1) : '-'}분` })}
                                          onMouseMove={(e) => setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : prev))}
                                          onMouseLeave={() => setTooltip(null)}
                                        />
                                      )
                                      yCursor += p.h
                                      return rectEl
                                    })}
                                  </g>
                                )
                              })() : (
                                <rect
                                  x={minutesX}
                                  y={y}
                                  width={minutesBarW}
                                  height={h}
                                  rx={1}
                                  className={'fill-indigo-400'}
                                  opacity={(r?.minutes?.[monthOrderIdx[i]] ?? null) == null ? 0.25 : 1}
                                  onMouseEnter={(e) => setTooltip({ x: e.clientX + 12, y: e.clientY + 12, content: `${num}. ${(s?.name) ?? '-'} · ${monthOrderIdx[i] + 1}월 운동시간 ${typeof rawMinutesVal === 'number' ? rawMinutesVal.toFixed(1) : '-'}분${accText}` })}
                                  onMouseMove={(e) => setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : prev))}
                                  onMouseLeave={() => setTooltip(null)}
                                />
                              )}
                              {category !== 'all' && (() => {
                                const acc = accVal
                                if (typeof acc !== 'number') return null
                                const accClamped = Math.max(0, Math.min(100, acc))
                                const capH = Math.round(h * (accClamped / 100))
                                const capY = height - 3 - capH
                                return (
                                  <rect
                                    x={minutesX}
                                    y={capY}
                                    width={minutesBarW}
                                    height={capH}
                                    rx={1}
                                    className={'fill-teal-600'}
                                    pointerEvents="none"
                                  />
                                )
                              })()}
                              <rect
                                x={calX}
                                y={height - 3 - calH}
                                width={calBarW}
                                height={calH}
                                rx={1}
                                className={'fill-yellow-500'}
                                opacity={(r?.calories?.[monthOrderIdx[i]] ?? null) == null ? 0.25 : 1}
                                onMouseEnter={(e) => setTooltip({ x: e.clientX + 12, y: e.clientY + 12, content: `${num}. ${(s?.name) ?? '-'} · ${monthOrderIdx[i] + 1}월 칼로리 ${typeof calVal === 'number' ? calVal.toFixed(1) : '-'}kcal` })}
                                onMouseMove={(e) => setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : prev))}
                                onMouseLeave={() => setTooltip(null)}
                              />
                            </g>
                          )
                        })}
                        <line x1="8" y1={height - 3} x2={width - 8} y2={height - 3} stroke="#E5E7EB" strokeWidth="1" />
                      </svg>
                      <div className="mt-1 grid grid-cols-12 gap-1">
                        {months.map((m, i) => (
                          <div key={`${contentKey}-${i}`} className={`text-[10px] text-center text-gray-400`}>{monthOrderIdx[i] + 1}</div>
                        ))}
                      </div>
                    </div>

                    {/* 오른쪽: 심박수 라인 차트 */}
                    <div>
                      <div className="mb-1 text-xs text-gray-600 flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-1 bg-indigo-500" /> 평균 bpm</span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-600"><span className="inline-block w-3 h-1 bg-rose-500" /> 최대 bpm</span>
                      </div>
                      <svg width={width} height={height} className="block">
                        <line x1="8" y1={height - 3} x2={width - 8} y2={height - 3} stroke="#E5E7EB" strokeWidth="1" />
                        {avgData.map((v: number, i: number) => {
                          if (i === 0) return null
                          const prev = avgDataRawOrdered[i - 1]
                          const curr = avgDataRawOrdered[i]
                          if (prev == null || curr == null) return null
                          const x1 = 12 + (i - 1) * (barW + gap) + barW / 2
                          const x2 = 12 + i * (barW + gap) + barW / 2
                          const y1 = height - 3 - Math.round((avgData[i - 1] / bpmMax) * (height - 6))
                          const y2 = height - 3 - Math.round((avgData[i] / bpmMax) * (height - 6))
                          return <line key={`avg-b-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6366F1" strokeWidth="2" />
                        })}
                        {maxData.map((v: number, i: number) => {
                          if (i === 0) return null
                          const prev = maxDataRawOrdered[i - 1]
                          const curr = maxDataRawOrdered[i]
                          if (prev == null || curr == null) return null
                          const x1 = 12 + (i - 1) * (barW + gap) + barW / 2
                          const x2 = 12 + i * (barW + gap) + barW / 2
                          const y1 = height - 3 - Math.round((maxData[i - 1] / bpmMax) * (height - 6))
                          const y2 = height - 3 - Math.round((maxData[i] / bpmMax) * (height - 6))
                          return <line key={`max-b-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F43F5E" strokeWidth="2" />
                        })}
                        {avgDataRawOrdered.map((v: number | null, i: number) => {
                          if (v == null) return null
                          const cx = 12 + i * (barW + gap) + barW / 2
                          const cy = height - 3 - Math.round(((avgData[i] || 0) / bpmMax) * (height - 6))
                          return (
                            <circle
                              key={`avgpb-${i}`}
                              cx={cx}
                              cy={cy}
                              r={2}
                              fill="#6366F1"
                              onMouseEnter={(e) => setTooltip({ x: e.clientX + 12, y: e.clientY + 12, content: `${num}. ${(s?.name) ?? '-'} · ${monthOrderIdx[i] + 1}월 평균 ${avgData[i]}` })}
                              onMouseMove={(e) => setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : prev))}
                              onMouseLeave={() => setTooltip(null)}
                            />
                          )
                        })}
                        {maxDataRawOrdered.map((v: number | null, i: number) => {
                          if (v == null) return null
                          const cx = 12 + i * (barW + gap) + barW / 2
                          const cy = height - 3 - Math.round(((maxData[i] || 0) / bpmMax) * (height - 6))
                          return (
                            <circle
                              key={`maxpb-${i}`}
                              cx={cx}
                              cy={cy}
                              r={2}
                              fill="#F43F5E"
                              onMouseEnter={(e) => setTooltip({ x: e.clientX + 12, y: e.clientY + 12, content: `${num}. ${(s?.name) ?? '-'} · ${monthOrderIdx[i] + 1}월 최대 ${maxData[i]}` })}
                              onMouseMove={(e) => setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : prev))}
                              onMouseLeave={() => setTooltip(null)}
                            />
                          )
                        })}
                        {/* 월별 히트박스: 심박수 호버 영역 확대 */}
                        {Array.from({ length: 12 }).map((_, i) => {
                          const x = 12 + i * (barW + gap)
                          return (
                            <rect
                              key={`hr-hit-${i}`}
                              x={x}
                              y={0}
                              width={barW}
                              height={height}
                              fill="transparent"
                              onMouseEnter={(e) => setTooltip({ x: e.clientX + 12, y: e.clientY + 12, content: `${num}. ${(s?.name) ?? '-'} · ${monthOrderIdx[i] + 1}월 평균 ${avgData[i]} / 최대 ${maxData[i]}` })}
                              onMouseMove={(e) => setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : prev))}
                              onMouseLeave={() => setTooltip(null)}
                            />
                          )
                        })}
                      </svg>
                      <div className="mt-1 grid grid-cols-12 gap-1">
                        {months.map((m, i) => (
                          <div key={i} className="text-[10px] text-center text-gray-400">{monthOrderIdx[i] + 1}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {tooltip && (
                    <div
                      className="pointer-events-none fixed z-50 rounded bg-black/80 px-2 py-1 text-[11px] text-white"
                      style={{ left: tooltip.x, top: tooltip.y }}
                    >
                      {tooltip.content}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

