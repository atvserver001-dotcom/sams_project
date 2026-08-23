'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import JumpRopeTestBoard, {
  JumpRopeSnapshotView,
} from '@/components/jump-rope/JumpRopeTestBoard'
import {
  isJumpRopeConnectionActionBusy,
  isJumpRopeConnectionContextLocked,
  isJumpRopeMeasurementConfigLocked,
  shouldApplyJumpRopeMeasurementCompletion,
  shouldClearJumpRopeMeasurementUi,
} from '@/components/jump-rope/jumpRopeUiState'
import { useWebSerialJumpRope } from '@/components/jump-rope/useWebSerialJumpRope'
import {
  JUMP_ROPE_MODE_OPTIONS,
  JumpRopeMode,
  getJumpRopeModeOption,
  normalizeJumpRopeTarget,
} from '@/lib/jumpRopeSerial'

type DeviceTestMode = 'jump-rope' | 'body-composition'

interface StudentRow {
  id: string
  student_no: number
  name: string
}

interface CohortSelection {
  year: number
  grade: number
  classNo: number
}

interface ConnectionCohortSnapshot extends CohortSelection {
  students: StudentRow[]
}

interface MeasurementConfigSnapshot {
  mode: JumpRopeMode
  target: number
}

const computeDefaultYear = () => {
  const now = new Date()
  const month = now.getMonth() + 1
  return month === 1 || month === 2 ? now.getFullYear() - 1 : now.getFullYear()
}

const selectionKeyOf = ({ year, grade, classNo }: CohortSelection) => `${year}:${grade}:${classNo}`

export default function DeviceTestPage() {
  const [deviceTestMode, setDeviceTestMode] = useState<DeviceTestMode>('jump-rope')
  const [year, setYear] = useState(computeDefaultYear)
  const [grade, setGrade] = useState(1)
  const [classNo, setClassNo] = useState(1)
  const [schoolType, setSchoolType] = useState<1 | 2 | 3>(1)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [studentsLoading, setStudentsLoading] = useState(true)
  const [loadedSelectionKey, setLoadedSelectionKey] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [ropeMode, setRopeMode] = useState<JumpRopeMode>(0)
  const [target, setTarget] = useState(0)
  const [connectionCohortSnapshot, setConnectionCohortSnapshot] = useState<ConnectionCohortSnapshot | null>(null)
  const [measurementConfigSnapshot, setMeasurementConfigSnapshot] = useState<MeasurementConfigSnapshot | null>(null)
  const [snapshotsBySlot, setSnapshotsBySlot] = useState<Record<number, JumpRopeSnapshotView>>({})
  const fetchGenerationRef = useRef(0)
  const measurementRequestGenerationRef = useRef(0)

  const selectedCohort = useMemo<CohortSelection>(() => ({ year, grade, classNo }), [year, grade, classNo])
  const selectedCohortKey = useMemo(() => selectionKeyOf(selectedCohort), [selectedCohort])
  const selectedModeOption = getJumpRopeModeOption(ropeMode)

  const handleSnapshot = useCallback((event: JumpRopeSnapshotView['event'], receivedAt: number) => {
    setSnapshotsBySlot((previous) => ({
      ...previous,
      [event.slot]: { event, receivedAt },
    }))
  }, [])
  const serialSession = useWebSerialJumpRope(handleSnapshot)

  const isConnecting = serialSession.state === 'connecting' ||
    serialSession.state === 'handshaking' ||
    serialSession.state === 'configuring'
  const isDisconnecting = serialSession.state === 'disconnecting'
  const hasConnection = serialSession.connection !== null
  const isMeasuring = serialSession.state === 'running'
  const connectionActionBusy = isJumpRopeConnectionActionBusy(serialSession.state)
  const lockConnectionContext = isJumpRopeConnectionContextLocked(serialSession.state, hasConnection)
  const lockMeasurementConfig = isJumpRopeMeasurementConfigLocked(serialSession.state, hasConnection)

  useEffect(() => {
    let cancelled = false
    const loadSchool = async () => {
      try {
        const response = await fetch('/api/school/info', { credentials: 'include' })
        const data = await response.json()
        if (!response.ok || cancelled) return
        const type = Number(data?.school?.school_type)
        if (type !== 1 && type !== 2 && type !== 3) return
        setSchoolType(type)
        setGrade((current) => Math.min(Math.max(1, current), type === 1 ? 6 : 3))
        setClassNo((current) => Math.min(Math.max(1, current), 10))
      } catch {
        // 학교 유형을 불러오지 못하면 기본값(초등 6개 학년)으로 테스트를 계속한다.
      }
    }
    void loadSchool()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const generation = fetchGenerationRef.current + 1
    fetchGenerationRef.current = generation
    const controller = new AbortController()
    const selection = selectedCohort
    const selectionKey = selectedCohortKey
    setStudentsLoading(true)
    setLoadedSelectionKey(null)
    setStudents([])
    setPageError(null)

    const loadStudents = async () => {
      try {
        const response = await fetch(
          `/api/school/students?year=${selection.year}&grade=${selection.grade}&class_no=${selection.classNo}`,
          { credentials: 'include', signal: controller.signal },
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '학생 정보 조회에 실패했습니다.')
        if (controller.signal.aborted || fetchGenerationRef.current !== generation) return
        const nextStudents = Array.isArray(data.students)
          ? (data.students as StudentRow[])
            .filter((student) => Number.isInteger(student.student_no) && student.student_no >= 1 && student.student_no <= 30)
            .sort((left, right) => left.student_no - right.student_no)
          : []
        setStudents(nextStudents)
        setLoadedSelectionKey(selectionKey)
      } catch (error) {
        if (controller.signal.aborted || fetchGenerationRef.current !== generation) return
        setStudents([])
        setLoadedSelectionKey(null)
        setPageError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!controller.signal.aborted && fetchGenerationRef.current === generation) setStudentsLoading(false)
      }
    }

    void loadStudents()
    return () => controller.abort()
  }, [selectedCohort, selectedCohortKey])

  useEffect(() => {
    const hasActiveConnection = serialSession.connection !== null
    if (shouldClearJumpRopeMeasurementUi(serialSession.state, hasActiveConnection)) {
      measurementRequestGenerationRef.current += 1
      if (serialSession.state === 'error' && !hasActiveConnection) {
        setConnectionCohortSnapshot(null)
      }
      setMeasurementConfigSnapshot(null)
      setSnapshotsBySlot({})
    }
  }, [serialSession.connection, serialSession.state])

  const clearFinishedMeasurement = () => {
    if (lockMeasurementConfig) return
    setMeasurementConfigSnapshot(null)
    setSnapshotsBySlot({})
  }

  const changeYear = (nextYear: number) => {
    clearFinishedMeasurement()
    setYear(nextYear)
  }

  const changeGrade = (nextGrade: number) => {
    clearFinishedMeasurement()
    setGrade(nextGrade)
  }

  const changeClassNo = (nextClassNo: number) => {
    clearFinishedMeasurement()
    setClassNo(nextClassNo)
  }

  const changeRopeMode = (mode: JumpRopeMode) => {
    clearFinishedMeasurement()
    const option = getJumpRopeModeOption(mode)
    setRopeMode(mode)
    setTarget(option.defaultTarget)
  }

  const changeTarget = (nextTarget: number) => {
    clearFinishedMeasurement()
    setTarget(nextTarget)
  }

  const handleConnect = () => {
    if (lockConnectionContext) return
    setPageError(null)
    measurementRequestGenerationRef.current += 1
    if (studentsLoading || loadedSelectionKey !== selectedCohortKey) {
      setPageError('선택한 학급의 학생 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.')
      return
    }

    const snapshot: ConnectionCohortSnapshot = {
      ...selectedCohort,
      students: students.map((student) => ({ ...student })),
    }
    setConnectionCohortSnapshot(snapshot)
    setMeasurementConfigSnapshot(null)
    setSnapshotsBySlot({})

    // Web Serial 포트 선택의 클릭 권한을 보존하기 위해 현재 클릭 핸들러에서 즉시 연결한다.
    const connectPromise = serialSession.connect()
    void connectPromise.then((connection) => {
      if (!connection) setConnectionCohortSnapshot(null)
    })
  }

  const handleDisconnect = () => {
    measurementRequestGenerationRef.current += 1
    void serialSession.disconnect().then(() => {
      setConnectionCohortSnapshot(null)
      setMeasurementConfigSnapshot(null)
      setSnapshotsBySlot({})
    })
  }

  const handleStartMeasurement = () => {
    if (serialSession.state !== 'connected') return
    const normalizedTarget = normalizeJumpRopeTarget(ropeMode, target)
    const config = { mode: ropeMode, target: normalizedTarget }
    const requestGeneration = measurementRequestGenerationRef.current + 1
    measurementRequestGenerationRef.current = requestGeneration
    setTarget(normalizedTarget)
    setMeasurementConfigSnapshot(config)
    setSnapshotsBySlot({})
    void serialSession.startMeasurement(config).then((measurement) => {
      if (!shouldApplyJumpRopeMeasurementCompletion(
        requestGeneration,
        measurementRequestGenerationRef.current,
      )) return
      if (!measurement) setMeasurementConfigSnapshot(null)
    })
  }

  const handleFinishMeasurement = () => {
    measurementRequestGenerationRef.current += 1
    void serialSession.finishMeasurement()
  }

  const displayStudents = connectionCohortSnapshot?.students ?? students
  const displayMode = measurementConfigSnapshot?.mode ?? ropeMode
  const displayTarget = measurementConfigSnapshot?.target ?? normalizeJumpRopeTarget(ropeMode, target)

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-bold">웹 기기 연동 테스트</h1>
        <p className="mt-1 text-sm text-indigo-100">ESP32-C5와 줄넘기·체성분 기기의 실제 연동을 검증하는 페이지입니다.</p>
      </div>

      <div className="inline-flex overflow-hidden rounded-full border border-white/70 bg-white shadow" role="tablist" aria-label="테스트 기기 선택">
        <button
          type="button"
          role="tab"
          aria-selected={deviceTestMode === 'jump-rope'}
          onClick={() => setDeviceTestMode('jump-rope')}
          disabled={lockConnectionContext}
          className={`px-6 py-2.5 text-sm font-bold transition-colors ${deviceTestMode === 'jump-rope' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          줄넘기
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={deviceTestMode === 'body-composition'}
          onClick={() => setDeviceTestMode('body-composition')}
          disabled={lockConnectionContext}
          className={`px-6 py-2.5 text-sm font-bold transition-colors ${deviceTestMode === 'body-composition' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          체성분
        </button>
      </div>

      {deviceTestMode === 'body-composition' ? (
        <section className="rounded-xl bg-white/95 p-10 text-center text-gray-900 shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl" aria-hidden="true">⚖</div>
          <h2 className="mt-4 text-xl font-bold">체성분 연동은 준비 중입니다</h2>
          <p className="mt-2 text-sm text-gray-500">JR203 줄넘기 실증을 완료한 뒤 BFS100 측정 흐름을 연결합니다.</p>
        </section>
      ) : (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900" role="note">
            최초 자동 식별 시에는 주변의 다른 JR203을 끄고, 테스트할 줄넘기 1대만 켜 주세요.
          </div>

          <section className="rounded-lg bg-white/95 p-6 text-gray-900 shadow">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-indigo-700">년도</label>
                  <select
                    value={year}
                    onChange={(event) => changeYear(Number(event.target.value))}
                    disabled={lockConnectionContext}
                    className="block h-12 w-36 rounded-lg border-2 border-indigo-300 bg-white px-4 text-center text-lg font-semibold text-gray-900 shadow outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {Array.from({ length: 7 }, (_, index) => computeDefaultYear() + 1 - index).map((item) => (
                      <option key={item} value={item}>{item}년</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-indigo-700">학년</label>
                  <select
                    value={grade}
                    onChange={(event) => changeGrade(Number(event.target.value))}
                    disabled={lockConnectionContext}
                    className="block h-12 w-36 rounded-lg border-2 border-indigo-300 bg-white px-4 text-center text-lg font-semibold text-gray-900 shadow outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {Array.from({ length: schoolType === 1 ? 6 : 3 }, (_, index) => index + 1).map((item) => (
                      <option key={item} value={item}>{item}학년</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-indigo-700">반</label>
                  <select
                    value={classNo}
                    onChange={(event) => changeClassNo(Number(event.target.value))}
                    disabled={lockConnectionContext}
                    className="block h-12 w-36 rounded-lg border-2 border-indigo-300 bg-white px-4 text-center text-lg font-semibold text-gray-900 shadow outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((item) => (
                      <option key={item} value={item}>{item}반</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-indigo-700">줄넘기 모드</label>
                  <select
                    value={ropeMode}
                    onChange={(event) => changeRopeMode(Number(event.target.value) as JumpRopeMode)}
                    disabled={lockMeasurementConfig}
                    className="block h-12 w-44 rounded-lg border-2 border-indigo-300 bg-white px-4 text-center text-base font-semibold text-gray-900 shadow outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {JUMP_ROPE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                {selectedModeOption.inputLabel ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-indigo-700">{selectedModeOption.inputLabel}</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={selectedModeOption.minTarget}
                        max={selectedModeOption.maxTarget}
                        step={selectedModeOption.stepTarget}
                        value={target}
                        onChange={(event) => changeTarget(Number(event.target.value))}
                        onBlur={() => changeTarget(normalizeJumpRopeTarget(ropeMode, target))}
                        disabled={lockMeasurementConfig}
                        className="block h-12 w-40 rounded-lg border-2 border-indigo-300 bg-white px-4 pr-11 text-center text-lg font-semibold text-gray-900 shadow outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-gray-500">
                        {selectedModeOption.unit}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                      {ropeMode === 1 ? '1~1,000회' : '1~60분 · 60초 단위'}
                    </p>
                  </div>
                ) : ropeMode === 3 ? (
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-indigo-700">시험 시간</span>
                    <div className="flex h-12 w-40 items-center justify-center rounded-lg border-2 border-gray-200 bg-gray-100 text-lg font-semibold text-gray-600">
                      60초 고정
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={hasConnection ? handleDisconnect : handleConnect}
                  disabled={connectionActionBusy || (!hasConnection && (
                    studentsLoading || loadedSelectionKey !== selectedCohortKey
                  ))}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${hasConnection ? 'bg-slate-700 hover:bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {(isConnecting || isDisconnecting) && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {isConnecting
                    ? '연결 중...'
                    : isDisconnecting
                      ? '해제 중...'
                      : hasConnection
                        ? '연결 해제'
                        : '기기 연결'}
                </button>

                <button
                  type="button"
                  onClick={handleStartMeasurement}
                  disabled={serialSession.state !== 'connected'}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {serialSession.state === 'starting' && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  시작 신호
                </button>

                <button
                  type="button"
                  onClick={handleFinishMeasurement}
                  disabled={!isMeasuring}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-rose-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {serialSession.state === 'finishing' && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  끝 신호
                </button>
              </div>
            </div>
          </section>

          {pageError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {pageError}
            </div>
          )}

          <JumpRopeTestBoard
            students={displayStudents}
            mode={displayMode}
            target={displayTarget}
            snapshotsBySlot={snapshotsBySlot}
            connectionState={serialSession.state}
            statusText={serialSession.statusText}
            connectionError={serialSession.error}
          />
        </>
      )}
    </div>
  )
}
