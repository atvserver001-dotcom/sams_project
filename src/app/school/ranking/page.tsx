'use client'

import React, { useEffect, useState } from 'react'
import { TrophyIcon } from '@heroicons/react/24/solid'

import {
  ACADEMIC_MONTHS,
  EmptyState,
  GradeBadge,
  SegmentButton,
  SelectField,
  getDefaultAcademicYear,
} from '@/components/SchoolAnalyticsUI'

type MainTab = 'exercise' | 'paps'
type ExerciseCategory = 'all' | 'strength' | 'cardio' | 'flexibility' | 'calorie'
type PapsCategory = 'total' | 'muscular' | 'speed' | 'flexibility' | 'cardio' | 'growth'

type ExerciseItem = {
  rank: number
  student_id: string
  name: string
  grade: number
  class_no: number
  student_no: number
  score: number
  minutes: number
  accuracy: number | null
  calories: number
}

type PapsItem = {
  rank: number
  student_id: string
  name: string
  grade: number
  class_no: number
  student_no: number
  score: number
  total_grade: number | null
  grades: {
    muscular: number | null
    speed: number | null
    flexibility: number | null
    cardio: number | null
  }
  growth_delta: number | null
  previous_total_grade: number | null
}

type RankingResponse<T> = {
  top3: T[]
  items: T[]
}

const PAGE_SIZE = 10

const exerciseTabs: Array<{ value: ExerciseCategory; label: string }> = [
  { value: 'all', label: '전체 운동효율왕' },
  { value: 'strength', label: '근력 운동효율왕' },
  { value: 'cardio', label: '심폐 운동효율왕' },
  { value: 'flexibility', label: '유연성 운동효율왕' },
  { value: 'calorie', label: '칼로리 소모왕' },
]

const papsTabs: Array<{ value: PapsCategory; label: string }> = [
  { value: 'total', label: '합계 등급왕' },
  { value: 'muscular', label: '근지구력왕' },
  { value: 'speed', label: '순발력왕' },
  { value: 'flexibility', label: '유연성왕' },
  { value: 'cardio', label: '심폐지구력왕' },
  { value: 'growth', label: '단기 성장왕' },
]

function years() {
  const base = getDefaultAcademicYear()
  return Array.from({ length: 7 }, (_, index) => base + 1 - index)
}

function scoreLabel(tab: MainTab, exerciseCategory: ExerciseCategory, item: ExerciseItem | PapsItem) {
  if (tab === 'exercise') {
    return exerciseCategory === 'calorie' ? `${item.score.toLocaleString()} kcal` : `${item.score.toLocaleString()}점`
  }
  return `${item.score > 0 ? '+' : ''}${item.score}점`
}

function detailLabel(tab: MainTab, exerciseCategory: ExerciseCategory, item: ExerciseItem | PapsItem) {
  if (tab === 'exercise') {
    const exercise = item as ExerciseItem
    if (exerciseCategory === 'calorie') return `칼로리 ${exercise.calories.toLocaleString()} kcal`
    return `운동 ${exercise.minutes.toLocaleString()}분 · 정확도 ${exercise.accuracy ?? '-'}%`
  }

  const paps = item as PapsItem
  if (paps.growth_delta != null) {
    return `이전 ${paps.previous_total_grade ?? '-'}등급 · 현재 ${paps.total_grade ?? '-'}등급`
  }
  return `PAPS ${paps.total_grade ?? '-'}등급`
}

function scoreRatio(row: ExerciseItem | PapsItem | null, topScore: number | null) {
  if (!row || topScore == null) return 0
  if (topScore <= 0) return row.score === topScore ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((row.score / topScore) * 100)))
}

function TopCards({
  tab,
  exerciseCategory,
  rows,
}: {
  tab: MainTab
  exerciseCategory: ExerciseCategory
  rows: Array<ExerciseItem | PapsItem>
}) {
  const cardRows = [0, 1, 2].map((index) => rows[index] ?? null)
  const labels = ['1위', '2위', '3위']
  const topScore = cardRows[0]?.score ?? null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {cardRows.map((row, index) => {
        const isFirst = index === 0
        const ratio = scoreRatio(row, topScore)

        return (
          <div
            key={labels[index]}
            className={`rounded-lg border p-5 shadow ${isFirst ? 'border-purple-300 bg-[#F5F0FF] ring-1 ring-purple-200' : 'border-gray-200 bg-white'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isFirst ? 'bg-purple-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {isFirst ? (
                    <span className="text-xl leading-none" aria-label="왕관">♛</span>
                  ) : (
                    <TrophyIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-purple-800">{labels[index]}</div>
                  <div className="truncate text-xs font-semibold text-gray-400">{row ? `#${row.rank}` : '측정 기록 없음'}</div>
                </div>
              </div>
              <div className="text-xs font-semibold text-gray-400">{isFirst ? 'TOP' : `#${index + 1}`}</div>
            </div>

            {row ? (
              <>
                <div className="mt-4 min-w-0">
                  <div className="truncate text-xl font-black text-gray-950">{row.name}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-500">{row.grade}학년 {row.class_no}반 {row.student_no}번</div>
                </div>
                <div className="mt-5">
                  <div className="text-3xl font-black text-purple-700">{scoreLabel(tab, exerciseCategory, row)}</div>
                  <div className="mt-1 text-xs font-semibold text-gray-500">{detailLabel(tab, exerciseCategory, row)}</div>
                </div>
                <div className="mt-4" aria-label={`${labels[index]} 점수 비율 ${ratio}%`}>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-500">
                    <span>점수 비율</span>
                    <span>{ratio}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-purple-100">
                    <div
                      className="h-full rounded-full bg-purple-700"
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 rounded-md border border-dashed border-gray-200 py-6 text-center text-3xl font-black text-gray-300">-</div>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-400">
                    <span>점수 비율</span>
                    <span>-</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100" />
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function RankingPage() {
  const [year, setYear] = useState(getDefaultAcademicYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [grade, setGrade] = useState('all')
  const [classNo, setClassNo] = useState('all')
  const [schoolType, setSchoolType] = useState<1 | 2 | 3>(1)
  const [mainTab, setMainTab] = useState<MainTab>('exercise')
  const [exerciseCategory, setExerciseCategory] = useState<ExerciseCategory>('all')
  const [papsCategory, setPapsCategory] = useState<PapsCategory>('total')
  const [exerciseData, setExerciseData] = useState<RankingResponse<ExerciseItem>>({ top3: [], items: [] })
  const [papsData, setPapsData] = useState<RankingResponse<PapsItem>>({ top3: [], items: [] })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadSchool = async () => {
      try {
        const res = await fetch('/api/school/info', { credentials: 'include' })
        const data = await res.json()
        const type = Number(data?.school?.school_type)
        if (type === 1 || type === 2 || type === 3) setSchoolType(type)
      } catch {
        setSchoolType(1)
      }
    }
    loadSchool()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          year: String(year),
          month: String(month),
        })
        if (mainTab === 'exercise') {
          params.set('category', exerciseCategory === 'calorie' ? 'all' : exerciseCategory)
          params.set('metric', exerciseCategory === 'calorie' ? 'calorie' : 'efficiency')
        } else {
          params.set('category', papsCategory)
        }
        if (grade !== 'all') params.set('grade', grade)
        if (classNo !== 'all') params.set('class_no', classNo)

        const url = mainTab === 'exercise'
          ? `/api/school/ranking/exercise?${params.toString()}`
          : `/api/school/ranking/paps?${params.toString()}`
        const res = await fetch(url, { credentials: 'include', signal: controller.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '랭킹 데이터를 불러오지 못했습니다.')
        if (mainTab === 'exercise') setExerciseData(data)
        else setPapsData(data)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [year, month, grade, classNo, mainTab, exerciseCategory, papsCategory])

  useEffect(() => {
    setPage(1)
  }, [year, month, grade, classNo, mainTab, exerciseCategory, papsCategory])

  const topRows = mainTab === 'exercise' ? exerciseData.top3 : papsData.top3
  const tableRows = mainTab === 'exercise' ? exerciseData.items : papsData.items
  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = tableRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = tableRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, tableRows.length)
  const maxGrade = schoolType === 1 ? 6 : 3

  return (
    <div className="space-y-6 text-gray-900">
      <h1 className="text-2xl font-bold text-white">랭킹</h1>

      <div className="rounded-lg bg-white/95 p-6 shadow">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField label="년도" value={year} onChange={(value) => setYear(Number(value))}>
            {years().map((item) => <option key={item} value={item}>{item}년</option>)}
          </SelectField>
          <SelectField label="학년" value={grade} onChange={setGrade}>
            <option value="all">전체</option>
            {Array.from({ length: maxGrade }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{item}학년</option>)}
          </SelectField>
          <SelectField label="반" value={classNo} onChange={setClassNo}>
            <option value="all">전체</option>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{item}반</option>)}
          </SelectField>
          <SelectField label="월" value={month} onChange={(value) => setMonth(Number(value))}>
            {ACADEMIC_MONTHS.map((item) => <option key={item} value={item}>{item}월</option>)}
          </SelectField>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex overflow-hidden rounded-full border border-white/70 shadow">
          <SegmentButton active={mainTab === 'exercise'} onClick={() => setMainTab('exercise')}>운동 기록 랭킹</SegmentButton>
          <SegmentButton active={mainTab === 'paps'} onClick={() => setMainTab('paps')}>PAPS 랭킹</SegmentButton>
        </div>
      </div>

      <div className="rounded-lg bg-white/95 p-5 shadow">
        <div className="flex flex-wrap gap-2">
          {(mainTab === 'exercise' ? exerciseTabs : papsTabs).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => mainTab === 'exercise' ? setExerciseCategory(tab.value as ExerciseCategory) : setPapsCategory(tab.value as PapsCategory)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab.value === (mainTab === 'exercise' ? exerciseCategory : papsCategory) ? 'bg-purple-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700 shadow">{error}</div>}

      <TopCards tab={mainTab} exerciseCategory={exerciseCategory} rows={topRows} />

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-950">전체 순위</h2>
          <div className="flex items-center gap-3 text-sm font-semibold text-gray-500">
            {tableRows.length > 0 && <span>{rangeStart}-{rangeEnd} / {tableRows.length}명</span>}
            {loading && <span className="text-gray-400">불러오는 중</span>}
          </div>
        </div>
        {tableRows.length === 0 ? (
          <EmptyState message="측정 기록 없음" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-purple-800 text-white">
                <tr>
                  <th className="px-3 py-3 text-left font-bold">순위</th>
                  <th className="px-3 py-3 text-left font-bold">이름</th>
                  <th className="px-3 py-3 text-left font-bold">학년/반</th>
                  {mainTab === 'exercise' ? (
                    <>
                      {exerciseCategory !== 'calorie' && <th className="px-3 py-3 text-right font-bold">운동시간</th>}
                      {exerciseCategory !== 'calorie' && <th className="px-3 py-3 text-right font-bold">정확도</th>}
                      <th className="px-3 py-3 text-right font-bold">{exerciseCategory === 'calorie' ? '칼로리' : '효율 점수'}</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3 text-center font-bold">합계</th>
                      <th className="px-3 py-3 text-center font-bold">근지구력</th>
                      <th className="px-3 py-3 text-center font-bold">순발력</th>
                      <th className="px-3 py-3 text-center font-bold">유연성</th>
                      <th className="px-3 py-3 text-center font-bold">심폐</th>
                      {papsCategory === 'growth' && <th className="px-3 py-3 text-right font-bold">직전 대비</th>}
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {pageRows.map((row, index) => (
                  <tr key={row.student_id} className={index % 2 === 1 ? 'bg-gray-50' : undefined}>
                    <td className="px-3 py-3 font-black text-purple-800">{row.rank}</td>
                    <td className="px-3 py-3 font-semibold">{row.name}</td>
                    <td className="px-3 py-3 text-gray-600">{row.grade}학년 {row.class_no}반 {row.student_no}번</td>
                    {mainTab === 'exercise' ? (
                      <>
                        {exerciseCategory !== 'calorie' && <td className="px-3 py-3 text-right">{(row as ExerciseItem).minutes.toLocaleString()}분</td>}
                        {exerciseCategory !== 'calorie' && <td className="px-3 py-3 text-right">{(row as ExerciseItem).accuracy ?? '-'}%</td>}
                        <td className="px-3 py-3 text-right font-black">{scoreLabel(mainTab, exerciseCategory, row as ExerciseItem)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-center"><GradeBadge grade={(row as PapsItem).total_grade} /></td>
                        <td className="px-3 py-3 text-center"><GradeBadge grade={(row as PapsItem).grades.muscular} /></td>
                        <td className="px-3 py-3 text-center"><GradeBadge grade={(row as PapsItem).grades.speed} /></td>
                        <td className="px-3 py-3 text-center"><GradeBadge grade={(row as PapsItem).grades.flexibility} /></td>
                        <td className="px-3 py-3 text-center"><GradeBadge grade={(row as PapsItem).grades.cardio} /></td>
                        {papsCategory === 'growth' && (
                          <td className="px-3 py-3 text-right font-black">
                            {(row as PapsItem).growth_delta != null ? `${(row as PapsItem).growth_delta! > 0 ? '+' : ''}${(row as PapsItem).growth_delta}점` : '-'}
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <div className="text-sm font-semibold text-gray-500">
                페이지당 {PAGE_SIZE}명 표시
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                >
                  이전
                </button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    className={`h-9 min-w-9 rounded-md px-3 text-sm font-black transition ${item === currentPage ? 'bg-purple-700 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    aria-current={item === currentPage ? 'page' : undefined}
                  >
                    {item}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  disabled={currentPage === pageCount}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
