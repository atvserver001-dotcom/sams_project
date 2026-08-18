'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  fullscreenFailureMessage,
  getFullscreenControlPresentation,
} from '@/lib/heartRateFullscreen'
import {
  HeartRateDeviceMapping,
  LiveHeartRateStats,
  averageHeartRate,
  currentHeartRateForSignal,
  getHeartRateSignalState,
} from '@/lib/heartRateSerial'
import { WebSerialSessionState } from './useWebSerialHeartRate'

interface LiveBoardStudent {
  id: string
  student_no: number
  name: string
}

interface LiveHeartRateBoardProps {
  students: LiveBoardStudent[]
  mappings: HeartRateDeviceMapping[]
  statsByStudentNumber: Record<number, LiveHeartRateStats>
  connectionState: WebSerialSessionState
  statusText: string
  connectionError: string | null
  onRetry: () => void
  onStop: () => void
  stopDisabled: boolean
}

const signalPresentation = {
  waiting: { label: '신호 대기', dot: 'bg-gray-300', text: 'text-gray-500' },
  fresh: { label: '수신 중', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  stale: { label: '신호 지연', dot: 'bg-amber-400', text: 'text-amber-700' },
  offline: { label: '오프라인', dot: 'bg-rose-500', text: 'text-rose-700' },
} as const

const connectionPresentation: Record<WebSerialSessionState, { label: string; classes: string }> = {
  idle: { label: '연결 대기', classes: 'bg-gray-100 text-gray-700' },
  connecting: { label: '포트 탐색 중', classes: 'bg-blue-100 text-blue-700' },
  handshaking: { label: '수신기 확인 중', classes: 'bg-amber-100 text-amber-800' },
  running: { label: '측정 중', classes: 'bg-emerald-100 text-emerald-800' },
  stopping: { label: '종료 중', classes: 'bg-gray-100 text-gray-700' },
  error: { label: '연결 오류', classes: 'bg-rose-100 text-rose-700' },
}

export default function LiveHeartRateBoard({
  students,
  mappings,
  statsByStudentNumber,
  connectionState,
  statusText,
  connectionError,
  onRetry,
  onStop,
  stopDisabled,
}: LiveHeartRateBoardProps) {
  const [now, setNow] = useState(() => Date.now())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const boardRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const timerId = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timerId)
  }, [])

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === boardRef.current)
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    syncFullscreenState()
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])

  const studentsByNumber = useMemo(
    () => new Map(students.map((student) => [student.student_no, student])),
    [students],
  )
  const mappedNumbers = useMemo(
    () => new Set(mappings.filter((mapping) => mapping.device_id !== '').map((mapping) => mapping.student_no)),
    [mappings],
  )
  const receivingCount = Object.values(statsByStudentNumber).filter(
    (stats) => getHeartRateSignalState(stats, now) === 'fresh',
  ).length
  const connection = connectionPresentation[connectionState]
  const fullscreenControl = getFullscreenControlPresentation(isFullscreen)

  const toggleFullscreen = async () => {
    const board = boardRef.current
    const action = fullscreenControl.action
    setFullscreenError(null)

    try {
      if (action === 'exit') {
        if (typeof document.exitFullscreen !== 'function') {
          throw new Error('이 브라우저는 전체화면 종료 기능을 지원하지 않습니다.')
        }
        await document.exitFullscreen()
      } else {
        if (!document.fullscreenEnabled || !board || typeof board.requestFullscreen !== 'function') {
          throw new Error('이 브라우저는 전체화면 기능을 지원하지 않습니다.')
        }
        await board.requestFullscreen()
      }
    } catch (fullscreenRequestError) {
      setFullscreenError(fullscreenFailureMessage(action, fullscreenRequestError))
    }
  }

  return (
    <section
      ref={boardRef}
      className={`${isFullscreen
        ? 'flex h-screen flex-col overflow-hidden rounded-none bg-white p-3'
        : 'rounded-xl bg-white/95 p-4 sm:p-5'
        } text-gray-900 shadow-lg`}
      aria-labelledby="live-heart-rate-title"
    >
      <div className={`${isFullscreen ? 'mb-2 shrink-0' : 'mb-4'} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 id="live-heart-rate-title" className="text-lg font-bold text-gray-900">실시간 심박 현황</h2>
          <p className="mt-1 text-xs text-gray-500">
            심박계 배정 {mappedNumbers.size}대 · 현재 수신 {receivingCount}대
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2" aria-live="polite">
            <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold ${connection.classes}`}>
              {connectionState === 'running' && (
                <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
              )}
              {connection.label}
            </span>
            <span className="text-xs text-gray-500">{statusText}</span>
          </div>
          {isFullscreen && connectionState === 'running' && (
            <button
              type="button"
              onClick={onStop}
              disabled={stopDisabled}
              aria-label="심박수 측정 중지"
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-white" aria-hidden="true" />
              측정 중지
            </button>
          )}
          {(connectionState === 'running' || isFullscreen) && (
              <button
                type="button"
                onClick={() => { void toggleFullscreen() }}
                aria-label={fullscreenControl.label}
                title={fullscreenControl.label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {isFullscreen ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5H3m18 0h-5V3M3 16h5v5m8 0v-5h5" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H3v5m18 0V3h-5M3 16v5h5m8 0h5v-5" />
                  </svg>
                )}
                {fullscreenControl.label}
              </button>
          )}
        </div>
      </div>

      {fullscreenError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <span>{fullscreenError}</span>
          <button
            type="button"
            onClick={() => setFullscreenError(null)}
            aria-label="전체화면 오류 안내 닫기"
            className="rounded p-1 text-amber-700 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {connectionError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          <span>{connectionError}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            USB 다시 연결
          </button>
        </div>
      )}

      <div className={`${isFullscreen
        ? 'min-h-0 flex-1 grid-cols-6 grid-rows-5 gap-1 p-1'
        : 'grid-cols-1 gap-2 p-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
        } grid rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700`}>
        {Array.from({ length: 30 }).map((_, index) => {
          const studentNumber = index + 1
          const student = studentsByNumber.get(studentNumber)
          const hasMapping = mappedNumbers.has(studentNumber)
          const stats = statsByStudentNumber[studentNumber]
          const signalState = getHeartRateSignalState(stats, now)
          const signal = signalPresentation[signalState]
          const currentBpm = currentHeartRateForSignal(stats, signalState)

          return (
            <article
              key={studentNumber}
              className={`${isFullscreen ? 'min-h-0 overflow-hidden p-2' : 'min-h-40 p-2.5'} rounded-lg bg-white shadow-sm transition-colors ${signalState === 'fresh' ? 'ring-2 ring-inset ring-emerald-300' : ''}`}
              aria-label={`${studentNumber}번 슬롯 ${student?.name ?? '학생'} 심박 현황`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate text-sm font-bold text-gray-900">
                  {student?.name ?? `${studentNumber}번 학생`}
                </h3>
                <span className="shrink-0 rounded-full bg-indigo-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  #{studentNumber} 슬롯
                </span>
              </div>

              <div className={`${isFullscreen ? 'mt-1' : 'mt-4'} text-center`}>
                <div className={`${isFullscreen ? 'text-2xl' : 'text-3xl'} font-black tracking-tight ${currentBpm ? 'text-indigo-600' : 'text-indigo-400'}`}>
                  {currentBpm ?? '--'}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">BPM</div>
              </div>

              <dl className={`${isFullscreen ? 'mt-1 gap-1' : 'mt-3 gap-2'} grid grid-cols-3 text-center`}>
                <div>
                  <dt className="text-[10px] text-gray-400">최대</dt>
                  <dd className="mt-0.5 text-xs font-bold text-gray-800">{stats?.maxBpm ?? '--'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-gray-400">평균</dt>
                  <dd className="mt-0.5 text-xs font-bold text-gray-800">
                    {stats ? averageHeartRate(stats).toFixed(1) : '--'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-gray-400">최저</dt>
                  <dd className="mt-0.5 text-xs font-bold text-gray-800">{stats?.minBpm ?? '--'}</dd>
                </div>
              </dl>

              <div className={`${isFullscreen ? 'mt-1 pt-1' : 'mt-3 pt-2'} flex items-center justify-between gap-1 border-t border-gray-100 text-[10px]`}>
                <span className={`inline-flex min-w-0 items-center gap-1 truncate font-semibold ${hasMapping ? signal.text : 'text-gray-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hasMapping ? signal.dot : 'bg-gray-300'}`} />
                  {hasMapping ? signal.label : '심박계 ID 미등록'}
                </span>
                <span className="text-gray-400" aria-label={`배터리 ${stats?.batteryPercent ?? '정보 없음'}`}>
                  배터리 {stats?.batteryPercent !== null && stats?.batteryPercent !== undefined ? `${stats.batteryPercent}%` : '--'}
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
