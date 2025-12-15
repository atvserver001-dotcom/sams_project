'use client'

import React, { useEffect, useState } from 'react'

type ExerciseType = 'endurance' | 'flexibility' | 'strength'

interface SchoolInfoResponse {
  school?: {
    id: string
    name: string
    group_no: string
    school_type: number
    recognition_key?: string
  }
  error?: string
}

export default function IngestTestPage() {
  const computeDefaultYear = () => {
    const now = new Date()
    const m = now.getMonth() + 1
    return (m === 1 || m === 2) ? now.getFullYear() - 1 : now.getFullYear()
  }

  const [recognitionKey, setRecognitionKey] = useState('')
  const [year, setYear] = useState<number>(computeDefaultYear)
  const [grade, setGrade] = useState<number>(1)
  const [classNo, setClassNo] = useState<number>(1)
  const [studentNo, setStudentNo] = useState<number>(1)
  const [exerciseType, setExerciseType] = useState<ExerciseType>('endurance')
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const [avgDuration, setAvgDuration] = useState<number>(600)
  const [avgAccuracy, setAvgAccuracy] = useState<number>(95)
  const [avgBpm, setAvgBpm] = useState<number>(130)
  const [avgMaxBpm, setAvgMaxBpm] = useState<number>(170)
  const [avgCalories, setAvgCalories] = useState<number>(120)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/school/info', { credentials: 'include' })
        const data: SchoolInfoResponse = await res.json().catch(() => ({} as any))
        if (res.ok && data.school) {
          if (data.school.recognition_key) {
            setRecognitionKey(data.school.recognition_key)
          }
        }
      } catch {
        // ignore
      }
    }
    load()
  }, [])

  const handleSend = async () => {
    setMessage(null)

    if (!recognitionKey) {
      setMessage('recognition_key가 없습니다. 수동으로 입력 후 다시 시도하세요.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        idempotency_key: `test-${Date.now()}`,
        recognition_key: recognitionKey,
        year,
        grade,
        class_no: classNo,
        student_no: studentNo,
        exercise_type: exerciseType,
        month,
        avg_duration_seconds: avgDuration,
        avg_accuracy: avgAccuracy,
        avg_bpm: avgBpm,
        avg_max_bpm: avgMaxBpm,
        avg_calories: avgCalories,
      }

      const res = await fetch('/api/device/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setMessage(`오류: ${data.error || res.statusText}`)
      } else {
        setMessage(`성공: ${JSON.stringify(data)}`)
      }
    } catch (e: any) {
      setMessage(`오류: ${e?.message || '요청 실패'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 text-gray-900">
      <h1 className="text-2xl font-bold text-white">디바이스 업설트 테스트</h1>

      <div className="bg-white/95 rounded-lg shadow p-6 space-y-4">
        <p className="text-sm text-gray-600">
          이 페이지는 디바이스에서 호출하는 `/api/device/ingest` 엔드포인트를 테스트하기 위한 도구입니다.
          기본 값으로 채워진 데이터를 현재 학교의 recognition_key로 전송합니다.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">recognition_key</label>
            <input
              type="text"
              value={recognitionKey}
              onChange={(e) => setRecognitionKey(e.target.value)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              placeholder="학교 recognition_key"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">학년도 (year)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || computeDefaultYear())}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">학년 (grade)</label>
            <input
              type="number"
              min={1}
              max={12}
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value) || 1)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">반 (class_no)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={classNo}
              onChange={(e) => setClassNo(Number(e.target.value) || 1)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">번호 (student_no)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={studentNo}
              onChange={(e) => setStudentNo(Number(e.target.value) || 1)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">운동 종류 (exercise_type)</label>
            <select
              value={exerciseType}
              onChange={(e) => setExerciseType(e.target.value as ExerciseType)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="endurance">endurance (지구력)</option>
              <option value="flexibility">flexibility (유연성)</option>
              <option value="strength">strength (근력)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">월 (month, 1-12)</label>
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return
                setMonth(Math.min(12, Math.max(1, v)))
              }}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">평균 운동시간(초)</label>
            <input
              type="number"
              value={avgDuration}
              onChange={(e) => setAvgDuration(Number(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">평균 정확도(%)</label>
            <input
              type="number"
              value={avgAccuracy}
              onChange={(e) => setAvgAccuracy(Number(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">평균 심박수(bpm)</label>
            <input
              type="number"
              value={avgBpm}
              onChange={(e) => setAvgBpm(Number(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">최대 심박 평균(bpm)</label>
            <input
              type="number"
              value={avgMaxBpm}
              onChange={(e) => setAvgMaxBpm(Number(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">평균 칼로리(kcal)</label>
            <input
              type="number"
              value={avgCalories}
              onChange={(e) => setAvgCalories(Number(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>

        {message && (
          <div className="text-sm mt-2 whitespace-pre-wrap break-words">
            {message}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSend}
            disabled={loading}
            className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? '전송 중...' : '업설트 요청 전송'}
          </button>
        </div>
      </div>
    </div>
  )
}


