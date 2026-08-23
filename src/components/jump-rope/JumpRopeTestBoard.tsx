'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  JUMP_ROPE_PROFILE,
  JumpRopeMode,
  JumpRopeSnapshotEvent,
  getJumpRopeCardRule,
  getJumpRopeModePresentation,
  getJumpRopeSignalState,
} from '../../lib/jumpRopeSerial'
import { WebSerialJumpRopeState } from './useWebSerialJumpRope'
import { getJumpRopeSlotLifecycleLabel } from './jumpRopeUiState'

interface JumpRopeBoardStudent {
  id: string
  student_no: number
  name: string
}

export interface JumpRopeSnapshotView {
  event: JumpRopeSnapshotEvent
  receivedAt: number
}

interface JumpRopeTestBoardProps {
  students: JumpRopeBoardStudent[]
  mode: JumpRopeMode
  target: number
  snapshotsBySlot: Record<number, JumpRopeSnapshotView>
  connectionState: WebSerialJumpRopeState
  statusText: string
  connectionError: string | null
}

type BatteryLevel = 1 | 2 | 3 | 4

const connectionPresentation: Record<WebSerialJumpRopeState, { label: string; classes: string }> = {
  idle: { label: '연결 대기', classes: 'bg-gray-100 text-gray-700' },
  connecting: { label: '포트 탐색 중', classes: 'bg-blue-100 text-blue-700' },
  handshaking: { label: '핸드셰이크 중', classes: 'bg-amber-100 text-amber-800' },
  configuring: { label: 'JR203 준비 중', classes: 'bg-amber-100 text-amber-800' },
  connected: { label: '기기 연결됨', classes: 'bg-blue-100 text-blue-800' },
  reconnecting: { label: 'JR203 재연결 중', classes: 'bg-amber-100 text-amber-800' },
  starting: { label: '시작 신호 전송 중', classes: 'bg-amber-100 text-amber-800' },
  running: { label: '측정 중', classes: 'bg-emerald-100 text-emerald-800' },
  finishing: { label: '끝 신호 전송 중', classes: 'bg-amber-100 text-amber-800' },
  disconnecting: { label: '연결 해제 중', classes: 'bg-gray-100 text-gray-700' },
  error: { label: '연결 오류', classes: 'bg-rose-100 text-rose-700' },
}

const signalPresentation = {
  waiting: { label: '신호 대기', dot: 'bg-gray-300', text: 'text-gray-500' },
  fresh: { label: '수신 중', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  stale: { label: '신호 지연', dot: 'bg-amber-400', text: 'text-amber-700' },
  offline: { label: '오프라인', dot: 'bg-rose-500', text: 'text-rose-700' },
} as const

const batteryLevel = (percent: number | null | undefined): BatteryLevel | null => {
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return null
  if (percent <= 25) return 1
  if (percent <= 50) return 2
  if (percent <= 75) return 3
  return 4
}

function JumpRopeBatteryIcon({ percent }: { percent: number | null | undefined }) {
  const level = batteryLevel(percent)
  const available = level !== null
  const label = available ? `배터리 ${Math.round(percent as number)}퍼센트, ${level}단계` : '배터리 정보 없음'
  const color = level === 1
    ? 'text-rose-500'
    : level === 2
      ? 'text-amber-500'
      : level === 3
        ? 'text-emerald-500'
        : level === 4
          ? 'text-emerald-600'
          : 'text-gray-400'

  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 items-center gap-1 ${color}`}>
      <svg viewBox="0 0 30 14" className="h-3.5 w-[30px]" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="24" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M26 4.5h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-2v-5Z" fill="currentColor" />
        {[0, 1, 2, 3].map((segment) => (
          <rect
            key={segment}
            x={3.5 + segment * 5.25}
            y="3.5"
            width="3.75"
            height="7"
            rx="0.75"
            className={available && segment < level ? 'fill-current' : 'fill-gray-200'}
          />
        ))}
      </svg>
      <span className="text-[10px] font-bold">{available ? `${Math.round(percent as number)}%` : '?'}</span>
    </span>
  )
}

export default function JumpRopeTestBoard({
  students,
  mode,
  target,
  snapshotsBySlot,
  connectionState,
  statusText,
  connectionError,
}: JumpRopeTestBoardProps) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  const studentsByNumber = useMemo(
    () => new Map(students.map((student) => [student.student_no, student])),
    [students],
  )
  const connection = connectionPresentation[connectionState]
  const receivingCount = Object.values(snapshotsBySlot).filter(
    (snapshot) => getJumpRopeSignalState(snapshot.receivedAt, now) === 'fresh',
  ).length
  return (
    <section className="rounded-xl bg-white/95 p-4 text-gray-900 shadow-lg sm:p-5" aria-labelledby="jump-rope-board-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="jump-rope-board-title" className="text-lg font-bold text-gray-900">JR203 줄넘기 실시간 현황</h2>
          <p className="mt-1 text-xs text-gray-500">
            학생 카드 30개 · 현재 펌웨어 동시 연결 1대 · 신호 수신 {receivingCount}대
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-700">
            최초 자동 식별 중에는 테스트할 JR203 줄넘기 1대만 켜 두세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold ${connection.classes}`}>
            {(connectionState === 'connected' || connectionState === 'running') && (
              <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            )}
            {connection.label}
          </span>
          <span className="max-w-xl text-xs text-gray-500">{statusText}</span>
        </div>
      </div>

      {connectionError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {connectionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 p-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 30 }).map((_, index) => {
          const slot = index + 1
          const student = studentsByNumber.get(slot)
          const snapshot = snapshotsBySlot[slot]
          const event = snapshot?.event
          const signalState = getJumpRopeSignalState(snapshot?.receivedAt, now)
          const signal = signalPresentation[signalState]
          const modePresentation = getJumpRopeModePresentation(mode, event?.mode)
          const isCurrentGatewaySlot = slot === JUMP_ROPE_PROFILE.slot
          const lifecycleLabel = getJumpRopeSlotLifecycleLabel(connectionState)
          const signalLabel = isCurrentGatewaySlot && lifecycleLabel
            ? lifecycleLabel
            : event
              ? signal.label
              : connectionState === 'running' && isCurrentGatewaySlot
                ? '신호 대기'
                : '미연결'

          return (
            <article
              key={slot}
              className={`flex min-h-56 flex-col rounded-lg bg-white p-3 shadow-sm transition-colors ${signalState === 'fresh' ? 'ring-2 ring-inset ring-emerald-300' : ''}`}
              aria-label={`${slot}번 슬롯 ${student?.name ?? '학생'} 줄넘기 현황`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">
                  {student?.name ?? `${slot}번 학생`}
                </h3>
                <span className="shrink-0 rounded-full bg-indigo-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  #{slot} 슬롯
                </span>
              </div>

              <div className="mt-4 text-center">
                <p className={`text-xs font-bold ${modePresentation.state === 'mismatch' ? 'text-rose-700' : 'text-indigo-700'}`}>
                  {modePresentation.label}
                </p>
                <p className={`mt-1 min-h-5 text-xs ${modePresentation.state === 'mismatch' ? 'font-bold text-rose-600' : 'text-gray-500'}`}>
                  {modePresentation.warning ?? getJumpRopeCardRule(mode, target, event)}
                </p>
              </div>

              <div className="flex flex-1 items-center justify-center py-3">
                <span className={`text-5xl font-black tabular-nums tracking-tight ${event ? 'text-indigo-600' : 'text-indigo-300'}`}>
                  {event?.count.toLocaleString('ko-KR') ?? '--'}
                </span>
                <span className="ml-2 self-end pb-4 text-xs font-bold text-gray-400">회</span>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-[10px]">
                <span className={`inline-flex min-w-0 items-center gap-1 truncate font-semibold ${event ? signal.text : 'text-gray-400'}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event ? signal.dot : 'bg-gray-300'}`} />
                  {signalLabel}
                </span>
                <JumpRopeBatteryIcon percent={event?.battery_percent} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
