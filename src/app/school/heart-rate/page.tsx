"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import LiveHeartRateBoard from '@/components/heart-rate/LiveHeartRateBoard'
import { useWebSerialHeartRate } from '@/components/heart-rate/useWebSerialHeartRate'
import {
  HeartRateStatsByStudentNumber,
  createHeartRateStatsCollector,
} from '@/lib/heartRateCollector'
import {
  GatewayHeartRateEvent,
  HeartRateDeviceMapping,
  averageHeartRate,
  findMappedStudentNumber,
} from '@/lib/heartRateSerial'
import { validateHeartRateMappings } from '@/lib/heartRateMapping'

const HEART_RATE_STATS_FLUSH_MS = 250

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

interface CohortSelection {
  year: number
  grade: number
  classNo: number
}

interface MeasurementSnapshot extends CohortSelection {
  calendarYear: number
  month: number
  students: StudentRow[]
  mappings: HeartRateDeviceMapping[]
}

const selectionKeyOf = ({ year, grade, classNo }: CohortSelection) => `${year}:${grade}:${classNo}`

const emptyHeartRateRows = (students: StudentRow[]): HeartRateRow[] => {
  const empty12 = Array.from({ length: 12 }, () => null as number | null)
  return students
    .slice()
    .sort((a, b) => (a.student_no ?? 0) - (b.student_no ?? 0))
    .map((student) => ({
      student_id: student.id,
      student_no: student.student_no,
      name: student.name,
      avg_bpm: [...empty12],
      max_bpm: [...empty12],
      min_bpm: [...empty12],
    }))
}

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
  const [studentsLoading, setStudentsLoading] = useState(true)
  const [loadedSelectionKey, setLoadedSelectionKey] = useState<string | null>(null)
  const [rows, setRows] = useState<HeartRateRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mappings, setMappings] = useState<HeartRateDeviceMapping[]>([])
  const [mappingsLoading, setMappingsLoading] = useState(true)
  const [liveStats, setLiveStats] = useState<HeartRateStatsByStudentNumber>({})
  const [isLiveView, setIsLiveView] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [measurementSnapshot, setMeasurementSnapshot] = useState<MeasurementSnapshot | null>(null)
  const mappingsRef = useRef<HeartRateDeviceMapping[]>([])
  const measurementSnapshotRef = useRef<MeasurementSnapshot | null>(null)
  const studentFetchGenerationRef = useRef(0)
  const collectorRef = useRef<ReturnType<typeof createHeartRateStatsCollector> | null>(null)
  if (collectorRef.current === null) collectorRef.current = createHeartRateStatsCollector()
  const collector = collectorRef.current
  const finalStatsRef = useRef<HeartRateStatsByStudentNumber | null>(null)
  const flushedRevisionRef = useRef(0)
  const statsFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopInProgressRef = useRef(false)
  const mountedRef = useRef(true)
  const measurementButtonRef = useRef<HTMLButtonElement | null>(null)
  const saveDialogRef = useRef<HTMLDivElement | null>(null)
  const discardButtonRef = useRef<HTMLButtonElement | null>(null)
  const selectedCohort = useMemo<CohortSelection>(() => ({ year, grade, classNo }), [year, grade, classNo])
  const selectedCohortKey = useMemo(() => selectionKeyOf(selectedCohort), [selectedCohort])

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

  const requestHeartRateRows = useCallback(async (
    selection: CohortSelection,
    signal?: AbortSignal,
  ): Promise<HeartRateRow[]> => {
    const res = await fetch(
      `/api/school/heart-rate?grade=${selection.grade}&class_no=${selection.classNo}&year=${selection.year}`,
      { signal },
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '심박수 기록 조회 실패')
    return (data.rows || []) as HeartRateRow[]
  }, [])

  useEffect(() => {
    const generation = studentFetchGenerationRef.current + 1
    studentFetchGenerationRef.current = generation
    const controller = new AbortController()
    const selection = selectedCohort
    const selectionKey = selectedCohortKey

    setStudentsLoading(true)
    setLoadedSelectionKey(null)
    setStudents([])
    setRows([])
    setError(null)

    const loadCohort = async () => {
      try {
        const studentsResponse = await fetch(
          `/api/school/students?year=${selection.year}&grade=${selection.grade}&class_no=${selection.classNo}`,
          { signal: controller.signal },
        )
        const studentsData = await studentsResponse.json()
        if (!studentsResponse.ok) throw new Error(studentsData.error || '학생 조회 실패')

        const nextStudents = Array.isArray(studentsData.students)
          ? studentsData.students as StudentRow[]
          : []
        let nextRows: HeartRateRow[] = []
        let heartRateLoadError: string | null = null

        if (nextStudents.length > 0) {
          try {
            nextRows = await requestHeartRateRows(selection, controller.signal)
          } catch (heartRateError) {
            if (controller.signal.aborted) return
            nextRows = emptyHeartRateRows(nextStudents)
            heartRateLoadError = heartRateError instanceof Error ? heartRateError.message : String(heartRateError)
          }
        }

        if (controller.signal.aborted || studentFetchGenerationRef.current !== generation) return
        setStudents(nextStudents)
        setRows(nextRows)
        setError(heartRateLoadError)
        setLoadedSelectionKey(selectionKey)
      } catch (loadError) {
        if (controller.signal.aborted || studentFetchGenerationRef.current !== generation) return
        setStudents([])
        setRows([])
        setLoadedSelectionKey(null)
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!controller.signal.aborted && studentFetchGenerationRef.current === generation) {
          setStudentsLoading(false)
        }
      }
    }

    void loadCohort()
    return () => controller.abort()
  }, [requestHeartRateRows, selectedCohort, selectedCohortKey])

  useEffect(() => {
    let cancelled = false

    const fetchMappings = async () => {
      setMappingsLoading(true)
      try {
        const response = await fetch('/api/school/heart-rate-mappings', { credentials: 'include' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '심박계 매핑 조회 실패')
        if (!cancelled) {
          const nextMappings = Array.isArray(data.mappings)
            ? data.mappings.map((mapping: { student_no: number; device_id: string }) => ({
              student_no: Number(mapping.student_no),
              device_id: String(mapping.device_id ?? ''),
            }))
            : []
          setMappings(nextMappings)
        }
      } catch (mappingError) {
        if (!cancelled) {
          setMappings([])
          setError(mappingError instanceof Error ? mappingError.message : String(mappingError))
        }
      } finally {
        if (!cancelled) setMappingsLoading(false)
      }
    }

    void fetchMappings()
    return () => { cancelled = true }
  }, [grade, classNo, year])

  useEffect(() => {
    mappingsRef.current = mappings
  }, [mappings])

  const clearStatsFlushTimer = useCallback(() => {
    if (statsFlushTimerRef.current) clearInterval(statsFlushTimerRef.current)
    statsFlushTimerRef.current = null
  }, [])

  const startStatsFlushTimer = useCallback(() => {
    clearStatsFlushTimer()
    statsFlushTimerRef.current = setInterval(() => {
      const revision = collector.revision()
      if (revision === flushedRevisionRef.current) return

      flushedRevisionRef.current = revision
      setLiveStats(collector.snapshot())
    }, HEART_RATE_STATS_FLUSH_MS)
  }, [clearStatsFlushTimer, collector])

  const handleHeartRateEvent = useCallback((event: GatewayHeartRateEvent, receivedAt: number) => {
    const studentNumber = findMappedStudentNumber(event, mappingsRef.current)
    if (studentNumber === null) return

    collector.addSample(studentNumber, event, receivedAt)
  }, [collector])

  const serialSession = useWebSerialHeartRate(handleHeartRateEvent)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearStatsFlushTimer()
      collector.reset()
      finalStatsRef.current = null
      measurementSnapshotRef.current = null
      flushedRevisionRef.current = 0
      stopInProgressRef.current = false
    }
  }, [clearStatsFlushTimer, collector])

  useEffect(() => {
    if (!showSaveModal) return

    const measurementButton = measurementButtonRef.current
    const focusFrame = requestAnimationFrame(() => discardButtonRef.current?.focus())
    const keepFocusInsideDialog = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const dialog = saveDialogRef.current
      if (!dialog) return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInsideDialog)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', keepFocusInsideDialog)
      requestAnimationFrame(() => measurementButton?.focus())
    }
  }, [showSaveModal])

  const handleStartMeasurement = () => {
    setError(null)

    if (studentsLoading || loadedSelectionKey !== selectedCohortKey) {
      setError('선택한 학급의 학생 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    if (students.length === 0) {
      setError('선택한 학급에 측정할 학생이 없습니다.')
      return
    }
    if (mappingsLoading) {
      setError('심박계 ID를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.')
      return
    }

    const mappingValidation = validateHeartRateMappings(mappings)
    if (!mappingValidation.ok) {
      setError(`디바이스 설정 > Heart Fit 설정을 확인해 주세요. ${mappingValidation.error}`)
      return
    }
    const nonEmptyMappings = mappingValidation.mappings.filter((mapping) => mapping.device_id !== '')
    if (nonEmptyMappings.length === 0) {
      setError('배정된 심박계가 없습니다. 디바이스 설정 > Heart Fit 설정에서 측정 슬롯에 7자리 심박계 ID를 먼저 배정해 주세요.')
      return
    }

    const currentMonth = new Date().getMonth() + 1
    const snapshot: MeasurementSnapshot = {
      ...selectedCohort,
      calendarYear: currentMonth <= 2 ? selectedCohort.year + 1 : selectedCohort.year,
      month: currentMonth,
      students: students.map((student) => ({ ...student })),
      mappings: mappingValidation.mappings.map((mapping) => ({ ...mapping })),
    }
    measurementSnapshotRef.current = snapshot
    setMeasurementSnapshot(snapshot)
    mappingsRef.current = snapshot.mappings
    collector.begin()
    finalStatsRef.current = null
    flushedRevisionRef.current = 0
    setLiveStats({})
    startStatsFlushTimer()
    setSaveError(null)
    setIsLiveView(true)
    void serialSession.start()
  }

  const handleStopMeasurement = async () => {
    if (stopInProgressRef.current) return
    stopInProgressRef.current = true

    const finalStats = collector.freeze()
    clearStatsFlushTimer()
    finalStatsRef.current = finalStats
    flushedRevisionRef.current = collector.revision()
    setLiveStats(finalStats)

    try {
      await serialSession.stop()
    } finally {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        try { await document.exitFullscreen() } catch { }
      }
      if (mountedRef.current) {
        setSaveError(null)
        setShowSaveModal(true)
      }
      stopInProgressRef.current = false
    }
  }

  const returnToRecords = () => {
    clearStatsFlushTimer()
    collector.reset()
    finalStatsRef.current = null
    flushedRevisionRef.current = 0
    stopInProgressRef.current = false
    setShowSaveModal(false)
    setIsLiveView(false)
    setLiveStats({})
    measurementSnapshotRef.current = null
    setMeasurementSnapshot(null)
  }

  const saveMeasurement = async () => {
    const finalStats = finalStatsRef.current
    const snapshot = measurementSnapshotRef.current
    if (!snapshot || !finalStats) return

    const results = snapshot.students
      .filter((student) => student.id && finalStats[student.student_no]?.sampleCount > 0)
      .map((student) => {
        const stats = finalStats[student.student_no]
        return {
          student_id: student.id,
          student_no: student.student_no,
          year: snapshot.calendarYear,
          month: snapshot.month,
          avg_bpm: averageHeartRate(stats),
          max_bpm: stats.maxBpm,
          min_bpm: stats.minBpm,
          record_count: 1,
        }
      })

    if (results.length === 0) {
      setSaveError('저장할 심박 측정 데이터가 없습니다. 저장하지 않고 종료할 수 있습니다.')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      const response = await fetch('/api/school/heart-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          results,
          grade: snapshot.grade,
          class_no: snapshot.classNo,
          year: snapshot.year,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '측정 데이터 저장 실패')

      try {
        setRows(await requestHeartRateRows(snapshot))
      } catch (refreshError) {
        setRows(emptyHeartRateRows(snapshot.students))
        setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      }
      returnToRecords()
    } catch (saveRequestError) {
      setSaveError(saveRequestError instanceof Error ? saveRequestError.message : String(saveRequestError))
    } finally {
      setIsSaving(false)
    }
  }

  const monthOrderIdx = useMemo(() => [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1], [])
  const months = useMemo(() => monthOrderIdx.map((idx) => `${idx + 1}월`), [monthOrderIdx])
  const monthCellPx = 56 // 표 월별 셀 고정 폭(px)

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isLiveView ? '실시간 심박 측정' : '심박수 기록 관리'}</h1>
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
                disabled={isLiveView}
                className="block w-36 h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 hover:border-indigo-300 active:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled={isLiveView}
                className="block w-36 h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 hover:border-indigo-300 active:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled={isLiveView}
                className="block w-36 h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 hover:border-indigo-300 active:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}반</option>
                ))}
              </select>
            </div>
          </div>

          {/* 우측: 심박계 측정 시작 버튼 */}
          <div className="flex items-center gap-4">

            <button
              ref={measurementButtonRef}
              onClick={isLiveView ? handleStopMeasurement : handleStartMeasurement}
              className={`
                relative flex items-center justify-center gap-3 px-8 py-4 rounded-xl 
                font-bold text-lg transition-all duration-300 shadow-xl active:scale-95
                ${isLiveView
                  ? 'bg-gradient-to-br from-rose-600 to-red-700 text-white hover:shadow-rose-500/30 hover:-translate-y-0.5'
                  : 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white hover:shadow-indigo-500/30 hover:-translate-y-0.5'}
                disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none
              `}
              disabled={
                serialSession.state === 'connecting'
                || serialSession.state === 'handshaking'
                || serialSession.state === 'stopping'
                || (!isLiveView && (studentsLoading || loadedSelectionKey !== selectedCohortKey || mappingsLoading))
              }
            >
              {!isLiveView ? (
                <>
                  <div className="flex items-center justify-center p-1 bg-white/20 rounded-full mr-1">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                    </span>
                  </div>
                  심박수 측정 시작하기
                </>
              ) : serialSession.state === 'connecting' || serialSession.state === 'handshaking' ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  USB 연결 중...
                </>
              ) : serialSession.state === 'stopping' ? (
                <>측정 종료 중...</>
              ) : (
                <>
                  <span className="h-3 w-3 rounded-sm bg-white" />
                  심박수 측정 중지
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}

      {isLiveView ? (
        <LiveHeartRateBoard
          students={measurementSnapshot?.students ?? []}
          mappings={measurementSnapshot?.mappings ?? []}
          statsByStudentNumber={liveStats}
          connectionState={serialSession.state}
          statusText={serialSession.statusText}
          connectionError={serialSession.error}
          onRetry={() => { void serialSession.start() }}
          onStop={() => { void handleStopMeasurement() }}
          stopDisabled={serialSession.state !== 'running'}
        />
      ) : (
        <div className="bg-white/95 rounded-lg shadow p-6 text-gray-900">
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
      )}

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            ref={saveDialogRef}
            className="w-full max-w-md rounded-2xl bg-white p-6 text-gray-900 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-heart-rate-title"
            aria-describedby="save-heart-rate-description"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
              <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 id="save-heart-rate-title" className="text-center text-xl font-bold">측정 결과를 저장하시겠습니까?</h3>
            <p id="save-heart-rate-description" className="mt-2 text-center text-sm text-gray-500">
              실제 심박 신호가 수신된 학생의 평균·최고·최저 심박수만 이번 달 기록에 반영됩니다.
            </p>

            {saveError && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                {saveError}
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                ref={discardButtonRef}
                type="button"
                onClick={returnToRecords}
                disabled={isSaving}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                저장하지 않고 종료
              </button>
              <button
                type="button"
                onClick={() => { void saveMeasurement() }}
                disabled={isSaving}
                className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? '저장 중...' : '저장하고 종료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
