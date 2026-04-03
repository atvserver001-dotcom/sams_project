"use client"

import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'

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

type PapsViewMode = 'record' | 'grade'

interface PapsRow {
  student_id: string
  student_no: number
  name: string
  muscular_endurance: (number | null)[]
  power_1: (number | null)[]
  power_2: (number | null)[]
  flexibility_1: (number | null)[]
  flexibility_2: (number | null)[]
  cardio_1min: (number | null)[]
  cardio_2min: (number | null)[]
  cardio_3min: (number | null)[]
  bmi: (number | null)[]
}

interface GradeRefRow {
  id: number
  exercise_id: number
  school_id: number
  grade: number
  sex: number
  grade5: number[]
  grade4: number[]
  grade3: number[]
  grade2: number[]
  grade1: number[]
}

// 등급 점수 기준: 5등급 0~3, 4등급 4~7, 3등급 8~11, 2등급 12~15, 1등급 16~20
function calcGradeAndScore(
  value: number,
  ref: GradeRefRow
): { gradeNo: number; score: number } | null {
  const levels: { arr: number[]; gradeNo: number; baseScore: number }[] = [
    { arr: ref.grade1, gradeNo: 1, baseScore: 16 },
    { arr: ref.grade2, gradeNo: 2, baseScore: 12 },
    { arr: ref.grade3, gradeNo: 3, baseScore: 8 },
    { arr: ref.grade4, gradeNo: 4, baseScore: 4 },
    { arr: ref.grade5, gradeNo: 5, baseScore: 0 },
  ]

  if (value > ref.grade1[3]) {
    return { gradeNo: 1, score: 20 }
  }

  for (const lvl of levels) {
    if (value >= lvl.arr[0]) {
      let pos = 0
      for (let i = 3; i >= 0; i--) {
        if (value >= lvl.arr[i]) {
          pos = i
          break
        }
      }
      return { gradeNo: lvl.gradeNo, score: lvl.baseScore + pos }
    }
  }

  return { gradeNo: 5, score: 0 }
}

const BMI_SCORE_MAP = [13, 14, 15, 16, 17, 18, 19, 20, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

function getBmiResult(initialScore: number): { gradeNo: number; score: number; label: string } {
  const score = BMI_SCORE_MAP[Math.min(19, initialScore)] ?? 1

  let label = "정상"
  let gradeNo = 1

  if (score <= 4) {
    label = "고도비만"
    gradeNo = 5
  } else if (score <= 8) {
    label = "경도비만"
    gradeNo = 4
  } else if (score <= 12) {
    label = "과체중"
    gradeNo = 3
  } else if (score <= 16) {
    label = "마름"
    gradeNo = 2
  } else {
    label = "정상"
    gradeNo = 1
  }

  return { gradeNo, score, label }
}

function gradeColor(gradeNo: number): string {
  const colors: Record<number, string> = {
    1: 'bg-blue-100 text-blue-800',
    2: 'bg-green-100 text-green-800',
    3: 'bg-yellow-100 text-yellow-800',
    4: 'bg-orange-100 text-orange-800',
    5: 'bg-red-100 text-red-800',
  }
  return colors[gradeNo] ?? 'bg-gray-100 text-gray-800'
}

function gradeTextColor(gradeNo: number): string {
  const colors: Record<number, string> = {
    1: 'text-blue-700',
    2: 'text-green-700',
    3: 'text-yellow-700',
    4: 'text-orange-700',
    5: 'text-red-700',
  }
  return colors[gradeNo] ?? 'text-gray-700'
}

// 심폐지구력 합산 계산 헬퍼
function getCardioSum(row: PapsRow, idx: number): number | null {
  const c1 = row.cardio_1min[idx]
  const c2 = row.cardio_2min[idx]
  const c3 = row.cardio_3min[idx]
  if (c1 === null && c2 === null && c3 === null) return null
  return (c1 ?? 0) + (c2 ?? 0) + (c3 ?? 0)
}

// PEI (Physical Efficiency Index) 계산
// 1. 일반 (초등, 중등, 고등 여학생): PEI = D / P * 100
// 2. 고등학생 (남학생): PEI = D * 100 / (5.5 * p / 2) + 0.22 * (300 - D)
// D: 스텝운동 지속시간 (180초), P: 1+2+3분 심박수 합, p: 1분 심박수
function getCardioPEI(row: PapsRow, idx: number, schoolType: number, gender: Gender | null): number | null {
  const d = 180
  const c1 = row.cardio_1min[idx]
  const c2 = row.cardio_2min[idx]
  const c3 = row.cardio_3min[idx]

  // 고등학생(3) 남학생(M)
  if (schoolType === 3 && gender === 'M') {
    if (c1 === null || c1 === 0) return null
    const pei = (d * 100 / (5.5 * Number(c1) / 2)) + (0.22 * (300 - d))
    return Math.round(pei * 10) / 10
  }

  // 일반 공식 (초/중/고여)
  if (c1 === null || c2 === null || c3 === null) return null
  const P = Number(c1) + Number(c2) + Number(c3)
  if (P === 0) return null

  const pei = (d / P) * 100
  return Math.round(pei * 10) / 10
}

export default function PapsPage() {
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
  const [rows, setRows] = useState<PapsRow[]>([])
  const [gradeRefs, setGradeRefs] = useState<GradeRefRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [schoolName, setSchoolName] = useState<string>('')

  const [view, setView] = useState<PapsViewMode>('record')
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [studentPrintMonths, setStudentPrintMonths] = useState<Record<number, number>>({})
  const [showPrintTypeModal, setShowPrintTypeModal] = useState(false)
  const [showClassPrintModal, setShowClassPrintModal] = useState(false)
  const [classPrintMonth, setClassPrintMonth] = useState<number>(2) // 기본값 3월 (origIdx=2)
  const [showExcelModal, setShowExcelModal] = useState(false)
  const [excelMonth, setExcelMonth] = useState<number>(2)

  // 월 인덱스 순서 (3월~다음해 2월) - exercises/heart-rate와 동일
  const monthOrderIdx = useMemo(() => [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1], [])
  const months = useMemo(() => monthOrderIdx.map((idx) => `${idx + 1}월`), [monthOrderIdx])
  const monthCellPx = 56

  // 특정 학생의 특정 월 데이터 유무 확인
  const hasStudentData = (studentNo: number, origIdx: number) => {
    const row = rows.find(r => r.student_no === studentNo)
    if (!row) return false
    return (
      row.muscular_endurance[origIdx] !== null ||
      row.power_1[origIdx] !== null ||
      row.power_2[origIdx] !== null ||
      row.flexibility_1[origIdx] !== null ||
      row.flexibility_2[origIdx] !== null ||
      row.cardio_1min[origIdx] !== null ||
      row.cardio_2min[origIdx] !== null ||
      row.cardio_3min[origIdx] !== null ||
      row.bmi[origIdx] !== null
    )
  }

  // 모달 열릴 때 초기 월 설정 (데이터가 있는 마지막 월)
  useEffect(() => {
    if (showPrintModal) {
      const defaults: Record<number, number> = {}
      students.forEach(s => {
        const num = s.student_no
        for (let i = monthOrderIdx.length - 1; i >= 0; i--) {
          const origIdx = monthOrderIdx[i]
          if (hasStudentData(num, origIdx)) {
            defaults[num] = origIdx
            break
          }
        }
      })
      setStudentPrintMonths(defaults)
    }
  }, [showPrintModal]) // eslint-disable-line react-hooks/exhaustive-deps

  const onChangeYear = (v: number) => { setYear(v) }
  const onChangeGrade = (v: number) => { setGrade(v) }
  const onChangeClassNo = (v: number) => { setClassNo(v) }

  useEffect(() => {
    const loadSchool = async () => {
      try {
        const res = await fetch('/api/school/info', { credentials: 'include' })
        const data = await res.json()
        if (res.ok && data?.school) {
          if (data.school.name) setSchoolName(data.school.name)
          if (data.school.school_type) {
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
        }
      } catch { }
    }
    loadSchool()
  }, [])

  useEffect(() => {
    const loadGradeRefs = async () => {
      try {
        const res = await fetch('/api/school/paps/grade-reference', { credentials: 'include' })
        const data = await res.json()
        if (res.ok && data?.refs) {
          setGradeRefs(data.refs as GradeRefRow[])
        }
      } catch { }
    }
    loadGradeRefs()
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

  const fetchPaps = async (yearValue: number, studs: StudentRow[]) => {
    try {
      setError(null)
      const res = await fetch(`/api/school/paps?grade=${grade}&class_no=${classNo}&year=${yearValue}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'PAPS 기록 조회 실패')
      const apiRows = (data.rows || []) as PapsRow[]
      setRows(apiRows)
    } catch (e: unknown) {
      const empty12 = Array.from({ length: 12 }, () => null)
      const mapped: PapsRow[] = studs
        .slice()
        .sort((a, b) => (a.student_no ?? 0) - (b.student_no ?? 0))
        .map(s => ({
          student_id: s.id,
          student_no: s.student_no,
          name: s.name,
          muscular_endurance: [...empty12],
          power_1: [...empty12],
          power_2: [...empty12],
          flexibility_1: [...empty12],
          flexibility_2: [...empty12],
          cardio_1min: [...empty12],
          cardio_2min: [...empty12],
          cardio_3min: [...empty12],
          bmi: [...empty12],
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
    fetchPaps(year, students)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, year])

  // 기록 탭 필드 정의 (순발력/유연성 한 줄로 통합)
  const recordFields: {
    key: string;
    label: string;
    bgClass: string;
    textClass: string;
    render: (row: PapsRow, origIdx: number) => React.ReactNode
  }[] = [
      {
        key: 'muscular_endurance',
        label: '근지구력',
        bgClass: 'bg-indigo-50',
        textClass: 'text-indigo-700',
        render: (r, i) => r.muscular_endurance[i] !== null ? Math.round(Number(r.muscular_endurance[i])) : '-'
      },
      {
        key: 'power',
        label: '순발력',
        bgClass: 'bg-rose-50',
        textClass: 'text-rose-700',
        render: (r, i) => {
          const v1 = r.power_1[i]
          const v2 = r.power_2[i]
          if (v1 === null && v2 === null) return '-'
          return (
            <div className="flex flex-col text-[12px] font-medium leading-normal">
              <span>{v1 !== null ? Number(v1).toFixed(2) : '-'}</span>
              <div className="h-[1px] w-full bg-rose-200/50 my-0.5" />
              <span>{v2 !== null ? Number(v2).toFixed(2) : '-'}</span>
            </div>
          )
        }
      },
      {
        key: 'flexibility',
        label: '유연성',
        bgClass: 'bg-teal-50',
        textClass: 'text-teal-700',
        render: (r, i) => {
          const v1 = r.flexibility_1[i]
          const v2 = r.flexibility_2[i]
          if (v1 === null && v2 === null) return '-'
          return (
            <div className="flex flex-col text-[12px] font-medium leading-normal">
              <span>{v1 !== null ? Number(v1).toFixed(2) : '-'}</span>
              <div className="h-[1px] w-full bg-teal-200/50 my-0.5" />
              <span>{v2 !== null ? Number(v2).toFixed(2) : '-'}</span>
            </div>
          )
        }
      },
      {
        key: 'cardio_pei',
        label: '심폐지구력',
        bgClass: 'bg-amber-50',
        textClass: 'text-amber-700',
        render: (r, i) => {
          const student = students.find(s => s.id === r.student_id)
          const pei = getCardioPEI(r, i, schoolType, student?.gender ?? null)
          return pei !== null ? pei.toFixed(1) : '-'
        }
      },
      {
        key: 'bmi',
        label: '체질량지수',
        bgClass: 'bg-violet-50',
        textClass: 'text-violet-700',
        render: (r, i) => r.bmi[i] !== null ? Number(r.bmi[i]).toFixed(2) : '-'
      },
    ]

  // 등급 계산용 필드 (exerciseId 기준)
  const gradeFields: { key: string; label: string; bgClass: string; textClass: string; exerciseId: number; getValue: (row: PapsRow, origIdx: number) => number | null }[] = [
    { key: 'muscular_endurance', label: '근지구력', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', exerciseId: 1, getValue: (r, i) => r.muscular_endurance[i] },
    {
      key: 'power', label: '순발력', bgClass: 'bg-rose-50', textClass: 'text-rose-700', exerciseId: 2, getValue: (r, i) => {
        // 순발력: 1회, 2회 중 더 좋은 값 사용
        const v1 = r.power_1[i]
        const v2 = r.power_2[i]
        if (v1 === null && v2 === null) return null
        if (v1 === null) return v2
        if (v2 === null) return v1
        return Math.max(v1, v2)
      }
    },
    {
      key: 'flexibility', label: '유연성', bgClass: 'bg-teal-50', textClass: 'text-teal-700', exerciseId: 3, getValue: (r, i) => {
        // 유연성: 1회, 2회 중 더 좋은 값 사용
        const v1 = r.flexibility_1[i]
        const v2 = r.flexibility_2[i]
        if (v1 === null && v2 === null) return null
        if (v1 === null) return v2
        if (v2 === null) return v1
        return Math.max(v1, v2)
      }
    },
    {
      key: 'cardio_endurance', label: '심폐지구력', bgClass: 'bg-amber-50', textClass: 'text-amber-700', exerciseId: 4, getValue: (r, i) => {
        const student = students.find(s => s.id === r.student_id)
        return getCardioPEI(r, i, schoolType, student?.gender ?? null)
      }
    },
    { key: 'bmi', label: '체질량지수', bgClass: 'bg-violet-50', textClass: 'text-violet-700', exerciseId: 5, getValue: (r, i) => r.bmi[i] },
  ]

  // 등급 참조 행 찾기
  const findGradeRef = (exerciseId: number, studentGrade: number, gender: Gender | null): GradeRefRow | null => {
    if (gradeRefs.length === 0) return null
    const sexCode = gender === 'F' ? 2 : 1 // 성별 미지정 시 남(M)으로 기본 처리

    if (exerciseId === 4) {
      return gradeRefs.find(r => r.exercise_id === 4) ?? null
    }

    const exact = gradeRefs.find(r =>
      r.exercise_id === exerciseId &&
      r.school_id === schoolType &&
      r.grade === studentGrade &&
      r.sex === sexCode
    )
    if (exact) return exact

    const bySchool = gradeRefs.find(r =>
      r.exercise_id === exerciseId &&
      r.school_id === schoolType &&
      r.grade === 0 &&
      r.sex === sexCode
    )
    if (bySchool) return bySchool

    return gradeRefs.find(r =>
      r.exercise_id === exerciseId &&
      r.school_id === 0 &&
      r.sex === 0
    ) ?? null
  }

  // 항목별 한글 종목명 매핑 (결과지 출력용)
  const exerciseNames: Record<number, { category: string; method: string }> = {
    1: { category: '근력 / 근지구력 평가', method: '윗몸말아올리기' },
    2: { category: '순발력 평가', method: '제자리 멀리뛰기' },
    3: { category: '유연성 평가', method: '앉아 윗몸 앞으로 굽히기' },
    4: { category: '심폐지구력 평가', method: '스텝검사' },
    5: { category: '체지방 평가', method: '체질량지수 (BMI)' },
  }

  const gradeEmoji = (g: number) => {
    const map: Record<number, { emoji: string; label: string }> = {
      1: { emoji: '😄', label: '매우 우수' },
      2: { emoji: '🙂', label: '양호' },
      3: { emoji: '🙂', label: '양호' },
      4: { emoji: '😐', label: '우려' },
      5: { emoji: '😟', label: '위험' },
    }
    return map[g] ?? { emoji: '❓', label: '-' }
  }

  // 결과지 출력 핸들러
  const handlePrintStudent = (studentNo: number, selectedOrigIdx?: number) => {
    const student = students.find(s => s.student_no === studentNo) || null
    const record = rows.find(r => r.student_no === studentNo) || null
    const origIdx = selectedOrigIdx !== undefined ? selectedOrigIdx : 2 // 기본값 3월

    const gender = student?.gender ?? null
    const genderLabel = gender === 'M' ? '남' : gender === 'F' ? '여' : '-'
    const heightCm = student?.height_cm ?? '-'
    const weightKg = student?.weight_kg ?? '-'

    // 5개 항목별 등급/점수 계산
    const itemResults = gradeFields.map(field => {
      const ref = findGradeRef(field.exerciseId, grade, gender)
      const v = field.exerciseId === 4
        ? getCardioPEI(record as PapsRow, origIdx, schoolType, gender)
        : field.getValue(record as PapsRow, origIdx)
      if (v === null || v === undefined || !ref) return { exerciseId: field.exerciseId, rawValue: v, result: null, label: '-' }

      const res = calcGradeAndScore(Number(v), ref)
      if (!res) return { exerciseId: field.exerciseId, rawValue: v, result: null, label: '-' }

      if (field.exerciseId === 5) {
        const bmi = getBmiResult(res.score)
        return { exerciseId: field.exerciseId, rawValue: v, result: { gradeNo: bmi.gradeNo, score: bmi.score }, label: bmi.label }
      }
      return { exerciseId: field.exerciseId, rawValue: v, result: res, label: `${res.gradeNo}등급` }
    })

    const totalScore = itemResults.reduce((sum, item) => {
      return sum + (item.result?.score ?? 0)
    }, 0)
    const hasAnyData = itemResults.some(item => item.result !== null)

    const finalGrade = !hasAnyData ? 5
      : totalScore < 20 ? 5
        : totalScore < 40 ? 4
          : totalScore < 60 ? 3
            : totalScore < 80 ? 2
              : 1

    const gradeColorPrint = (g: number) => {
      const map: Record<number, string> = {
        1: '#2563eb', 2: '#16a34a', 3: '#ca8a04', 4: '#ea580c', 5: '#dc2626'
      }
      return map[g] ?? '#6b7280'
    }

    const gradeBgPrint = (g: number) => {
      const map: Record<number, string> = {
        1: '#dbeafe', 2: '#dcfce7', 3: '#fef9c3', 4: '#ffedd5', 5: '#fee2e2'
      }
      return map[g] ?? '#f3f4f6'
    }

    // 순발력/유연성 개별 값, 심폐지구력 개별 값
    const power1Val = record?.power_1[origIdx]
    const power2Val = record?.power_2[origIdx]
    const flex1Val = record?.flexibility_1[origIdx]
    const flex2Val = record?.flexibility_2[origIdx]
    const cardio1Val = record?.cardio_1min[origIdx]
    const cardio2Val = record?.cardio_2min[origIdx]
    const cardio3Val = record?.cardio_3min[origIdx]
    const cardioSumVal = record ? getCardioSum(record, origIdx) : null
    const cardioPeiVal = record ? getCardioPEI(record, origIdx, schoolType, gender) : null

    const powerResult = itemResults.find(i => i.exerciseId === 2)
    const cardioResult = itemResults.find(i => i.exerciseId === 4)
    const bmiResult = itemResults.find(i => i.exerciseId === 5)
    const allGrades = itemResults.map(i => i.result?.gradeNo ?? null)
    const allHaveGrade = allGrades.every(g => g !== null)

    const isSportsGifted = (powerResult?.result?.score === 20) && (cardioResult?.result?.score === 20)
    const isHealthExcellent = allHaveGrade && allGrades.every(g => g === 1)
    const isFitnessExcellent = cardioResult?.result?.gradeNo === 1
    const isLowFitness = allHaveGrade && allGrades.every(g => g !== null && g >= 4)
    const isObese = bmiResult?.result?.gradeNo !== undefined && bmiResult?.result?.gradeNo !== null && bmiResult.result.gradeNo >= 4

    const greenCheck = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#22c55e"/><path d="M10 18.5l5.5 5.5L26 13" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const redX = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#ef4444"/><path d="M12 12l12 12M24 12l-12 12" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`
    const emptyCircle = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/></svg>`

    // 측정 기록 세부 표시를 위한 함수
    const getMeasureHtml = (exerciseId: number, rawValue: number | null | undefined) => {
      if (exerciseId === 2) {
        // 순발력: 1회차, 2회차 가로 배치
        return `<div class="m-val-row">
          <div class="m-val-cell"><span class="m-cell-label">1회차</span><span class="m-cell-val">${power1Val !== null && power1Val !== undefined ? Number(power1Val).toFixed(2) : '-'}</span></div>
          <div class="m-val-cell"><span class="m-cell-label">2회차</span><span class="m-cell-val">${power2Val !== null && power2Val !== undefined ? Number(power2Val).toFixed(2) : '-'}</span></div>
        </div>`
      }
      if (exerciseId === 3) {
        // 유연성: 1회차, 2회차 가로 배치
        return `<div class="m-val-row">
          <div class="m-val-cell"><span class="m-cell-label">1회차</span><span class="m-cell-val">${flex1Val !== null && flex1Val !== undefined ? Number(flex1Val).toFixed(2) : '-'}</span></div>
          <div class="m-val-cell"><span class="m-cell-label">2회차</span><span class="m-cell-val">${flex2Val !== null && flex2Val !== undefined ? Number(flex2Val).toFixed(2) : '-'}</span></div>
        </div>`
      }
      if (exerciseId === 4) {
        // 심폐지구력(스텝검사): 좌측 PEI 기록, 우측 1~3분 심박수
        return `
        <div class="step-test">
          <div class="step-left">
            <div class="step-header">기록</div>
            <div class="step-pei"><span class="pei-val">${cardioPeiVal !== null ? cardioPeiVal.toFixed(1) : '-'}</span><span class="pei-label">(PEI)</span></div>
          </div>
          <div class="step-right">
            <div class="step-row"><span class="step-min">1분</span><span class="step-bpm">${cardio1Val ?? '-'}</span></div>
            <div class="step-row"><span class="step-min">2분</span><span class="step-bpm">${cardio2Val ?? '-'}</span></div>
            <div class="step-row"><span class="step-min">3분</span><span class="step-bpm">${cardio3Val ?? '-'}</span></div>
          </div>
        </div>`
      }
      return `<div class="m-val">측정 기록: ${rawValue !== null && rawValue !== undefined ? (exerciseId === 5 ? Number(rawValue).toFixed(2) : Math.round(Number(rawValue))) : '-'}</div>`
    }

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>PAPS 측정 결과 - ${student?.name ?? studentNo + '번'}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; width: 100%; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: #1f2937; background: #fff; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { display: flex; flex-direction: column; min-height: 100vh; padding: 14px 18px; }

  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 3px solid #e11d48; }
  .header-logo { display: inline-block; background: #e11d48; color: #fff; font-weight: 900; font-size: 14px; padding: 5px 14px; border-radius: 6px; letter-spacing: 0.5px; }
  .header-title { font-size: 18px; font-weight: 800; color: #e11d48; }
  .header-school { font-size: 14px; font-weight: 700; color: #374151; }

  .info-bar { display: flex; align-items: center; gap: 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
  .info-no { font-size: 32px; font-weight: 900; color: #e11d48; min-width: 55px; text-align: center; line-height: 1; }
  .info-no small { font-size: 11px; display: block; color: #9ca3af; font-weight: 500; }
  .info-body { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; flex: 1; }
  .info-body .col { font-size: 13px; color: #374151; }
  .info-body .col b { font-weight: 700; }
  .info-right { margin-left: auto; display: flex; gap: 22px; font-size: 13px; color: #374151; }
  .info-right b { font-weight: 700; }

  .cats { display: flex; flex-direction: column; gap: 0; flex: 1; }
  .cat { flex: 1; display: flex; flex-direction: column; margin-bottom: 10px; }
  .cat-title { font-size: 14px; font-weight: 900; color: #1f2937; border-left: 4px solid #e11d48; padding-left: 8px; margin-bottom: 6px; }
  .cat-row { display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fff; flex: 1; }
  .cat-measure { flex: 1.3; padding: 10px 14px; background: #f9fafb; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center; }
  .cat-measure .m-label { font-size: 10px; color: #9ca3af; margin-bottom: 4px; }
  .cat-measure .m-val { display: inline-block; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 12px; font-size: 13px; font-weight: 600; }

  /* 순발력/유연성 가로 배치 */
  .m-val-row { display: flex; gap: 8px; }
  .m-val-cell { flex: 1; border: 1px solid #d1d5db; border-radius: 4px; padding: 5px 8px; background: #fff; display: flex; flex-direction: column; align-items: center; }
  .m-cell-label { font-size: 9px; color: #9ca3af; font-weight: 500; margin-bottom: 2px; }
  .m-cell-val { font-size: 14px; font-weight: 700; color: #1f2937; }

  /* 심폐지구력 스텝검사 레이아웃 */
  .step-test { display: flex; gap: 0; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; background: #fff; }
  .step-left { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid #d1d5db; padding: 6px 8px; }
  .step-header { font-size: 9px; color: #9ca3af; font-weight: 500; margin-bottom: 2px; }
  .step-pei { display: flex; align-items: baseline; gap: 3px; }
  .pei-val { font-size: 18px; font-weight: 900; color: #1f2937; }
  .pei-label { font-size: 9px; color: #9ca3af; font-weight: 500; }
  .step-right { flex: 1; display: flex; flex-direction: column; }
  .step-row { display: flex; align-items: center; justify-content: space-between; padding: 3px 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  .step-row:last-child { border-bottom: none; }
  .step-min { color: #6b7280; font-weight: 500; }
  .step-bpm { font-weight: 700; color: #1f2937; }

  .cat-score { flex: 0.7; text-align: center; padding: 8px 0; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .cat-score .s-label { font-size: 10px; color: #9ca3af; }
  .cat-score .s-val { font-size: 26px; font-weight: 900; }
  .cat-grade { flex: 0.7; text-align: center; padding: 8px 0; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .cat-grade .g-label { font-size: 10px; color: #9ca3af; }
  .cat-grade .g-val { font-size: 17px; font-weight: 800; display: inline-block; padding: 3px 12px; border-radius: 5px; margin-top: 3px; }
  .cat-emoji { flex: 0.4; text-align: center; padding: 6px 0; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .cat-emoji .e-face { font-size: 32px; line-height: 1.1; }
  .cat-emoji .e-label { font-size: 10px; color: #6b7280; margin-top: 2px; }

  .paps-summary { margin-top: 14px; border: 2px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; background: #f9fafb; }
  .paps-summary h3 { font-size: 14px; font-weight: 900; margin-bottom: 12px; }
  .paps-summary .sum-row { display: flex; align-items: center; gap: 14px; }
  .sum-label { font-size: 13px; font-weight: 600; padding: 10px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .sum-score { font-size: 34px; font-weight: 900; flex: 1; text-align: center; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .sum-score span { font-size: 16px; font-weight: 500; color: #9ca3af; }
  .sum-grade { font-size: 22px; font-weight: 900; padding: 8px 20px; border-radius: 6px; border: 2px solid; }

  .badges { display: flex; justify-content: space-around; margin-top: 14px; padding: 12px 0 4px 0; border-top: 1px solid #e5e7eb; }
  .badge-item { text-align: center; min-width: 70px; }
  .badge-item .b-icon { height: 32px; display: flex; align-items: center; justify-content: center; }
  .badge-item .b-label { font-size: 10px; font-weight: 700; color: #374151; margin-top: 4px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-logo">ATV PAPS Care</div>
    <div class="header-title">스마트 PAPS 측정 결과</div>
    <div class="header-school">${schoolName || '-'}</div>
  </div>

  <div class="info-bar">
    <div class="info-no">${studentNo}<small>번</small></div>
    <div class="info-body">
      <div class="col"><b>학생 정보</b> | ${grade}학년 ${classNo}반 ${student?.name ?? studentNo + '번 학생'} (${genderLabel})</div>
      <div class="col"><b>측정 월</b> | ${origIdx + 1}월</div>
    </div>
    <div class="info-right">
      <div><b>체중</b> | ${weightKg}kg</div>
      <div><b>신장</b> | ${heightCm}cm</div>
    </div>
  </div>

  <div class="cats">
  ${itemResults.map(item => {
      const info = exerciseNames[item.exerciseId]
      const g = item.result ? item.result.gradeNo : 5
      const score = item.result ? (item.result.score ?? 0) : 0
      const label = item.result ? item.label : '5등급'
      const ej = gradeEmoji(g)
      return `
  <div class="cat">
    <div class="cat-title">${info.category}</div>
    <div class="cat-row">
      <div class="cat-measure">
        <div class="m-label">${info.method}</div>
        ${getMeasureHtml(item.exerciseId, item.rawValue)}
      </div>
      <div class="cat-score">
        <div class="s-label">평가 점수</div>
        <div class="s-val">${score}</div>
      </div>
      <div class="cat-grade">
        <div class="g-label">평가 결과</div>
        <div class="g-val" style="background:${gradeBgPrint(g)}; color:${gradeColorPrint(g)};">
          ${label}
        </div>
      </div>
      <div class="cat-emoji">
        <div class="e-face">${ej.emoji}</div>
        <div class="e-label">${ej.label}</div>
      </div>
    </div>
  </div>`
    }).join('')}
  </div>

  <div class="paps-summary">
    <h3>PAPS 평가</h3>
    <div class="sum-row">
      <div class="sum-label">신체 능력 검사 결과</div>
      <div class="sum-score">${totalScore}<span>/100</span></div>
      <div class="sum-grade" style="background:${gradeBgPrint(finalGrade)}; color:${gradeColorPrint(finalGrade)}; border-color:${gradeColorPrint(finalGrade)};">
        ${finalGrade}등급
      </div>
    </div>
  </div>

  <div class="badges">
    <div class="badge-item">
      <div class="b-icon">${isSportsGifted ? greenCheck : emptyCircle}</div>
      <div class="b-label">스포츠 영재</div>
    </div>
    <div class="badge-item">
      <div class="b-icon">${isHealthExcellent ? greenCheck : emptyCircle}</div>
      <div class="b-label">건강 체력 우수</div>
    </div>
    <div class="badge-item">
      <div class="b-icon">${isFitnessExcellent ? greenCheck : emptyCircle}</div>
      <div class="b-label">체력 우수</div>
    </div>
    <div class="badge-item">
      <div class="b-icon">${isLowFitness ? redX : emptyCircle}</div>
      <div class="b-label">저체력</div>
    </div>
    <div class="badge-item">
      <div class="b-icon">${isObese ? redX : emptyCircle}</div>
      <div class="b-label">비만</div>
    </div>
  </div>
</div>
  </div>
</div>
</body>
</html>`

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }

    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    }, 500)
  }

  // 학급 전체 결과지 출력 핸들러
  const handlePrintClassAll = (origIdx: number) => {
    const monthLabel = `${origIdx + 1}월`
    const dateStr = `${year}년 ${origIdx + 1}월`

    // 30명 학생 데이터 구성
    const classData = Array.from({ length: 30 }, (_, idx) => {
      const num = idx + 1
      const student = students.find(s => s.student_no === num) || null
      const record = rows.find(r => r.student_no === num) || null
      const gender = student?.gender ?? null

      const itemResults = gradeFields.map(field => {
        if (!record) return { exerciseId: field.exerciseId, rawValue: null, result: null, label: '-' }
        const ref = findGradeRef(field.exerciseId, grade, gender)
        const v = field.exerciseId === 4
          ? getCardioPEI(record, origIdx, schoolType, gender)
          : field.getValue(record, origIdx)
        if (v === null || v === undefined || !ref) return { exerciseId: field.exerciseId, rawValue: v, result: null, label: '-' }

        const res = calcGradeAndScore(Number(v), ref)
        if (!res) return { exerciseId: field.exerciseId, rawValue: v, result: null, label: '-' }

        if (field.exerciseId === 5) {
          const bmi = getBmiResult(res.score)
          return { exerciseId: field.exerciseId, rawValue: v, result: { gradeNo: bmi.gradeNo, score: bmi.score }, label: bmi.label }
        }
        return { exerciseId: field.exerciseId, rawValue: v, result: res, label: `${res.gradeNo}등급` }
      })

      const totalScore = itemResults.reduce((sum, item) => sum + (item.result?.score ?? 0), 0)
      const hasAnyData = itemResults.some(item => item.result !== null)
      const finalGrade = !hasAnyData ? null
        : totalScore < 20 ? 5
          : totalScore < 40 ? 4
            : totalScore < 60 ? 3
              : totalScore < 80 ? 2
                : 1

      // 측정값 가져오기
      const getMeasureValue = (exerciseId: number) => {
        if (!record) return '-'
        if (exerciseId === 1) {
          const v = record.muscular_endurance[origIdx]
          return v !== null ? Math.round(Number(v)).toString() : '-'
        }
        if (exerciseId === 2) {
          const v1 = record.power_1[origIdx]
          const v2 = record.power_2[origIdx]
          if (v1 === null && v2 === null) return '-'
          const s1 = v1 !== null ? Number(v1).toFixed(2) : '-'
          const s2 = v2 !== null ? Number(v2).toFixed(2) : '-'
          return `${s1} / ${s2}`
        }
        if (exerciseId === 3) {
          const v1 = record.flexibility_1[origIdx]
          const v2 = record.flexibility_2[origIdx]
          if (v1 === null && v2 === null) return '-'
          const s1 = v1 !== null ? Number(v1).toFixed(2) : '-'
          const s2 = v2 !== null ? Number(v2).toFixed(2) : '-'
          return `${s1} / ${s2}`
        }
        if (exerciseId === 4) {
          const pei = getCardioPEI(record, origIdx, schoolType, gender)
          return pei !== null ? pei.toFixed(1) : '-'
        }
        if (exerciseId === 5) {
          const v = record.bmi[origIdx]
          return v !== null ? Number(v).toFixed(2) : '-'
        }
        return '-'
      }

      return {
        num,
        name: student?.name ?? `${num}번 학생`,
        items: itemResults,
        measureValues: gradeFields.map(f => getMeasureValue(f.exerciseId)),
        totalScore: hasAnyData ? totalScore : null,
        finalGrade,
      }
    })

    // 15명씩 2페이지로 분할
    const pages = [classData.slice(0, 15), classData.slice(15, 30)]

    const gradeColorPrint = (g: number) => {
      const map: Record<number, string> = { 1: '#2563eb', 2: '#16a34a', 3: '#ca8a04', 4: '#ea580c', 5: '#dc2626' }
      return map[g] ?? '#6b7280'
    }
    const gradeBgPrint = (g: number) => {
      const map: Record<number, string> = { 1: '#dbeafe', 2: '#dcfce7', 3: '#fef9c3', 4: '#ffedd5', 5: '#fee2e2' }
      return map[g] ?? '#f3f4f6'
    }

    const exerciseHeaders = [
      { category: '근력·근지구력 평가', method: '윗몸 말아올리기' },
      { category: '순발력 평가', method: '제자리멀리뛰기' },
      { category: '유연성 평가', method: '앉아 윗몸앞으로 굽히기' },
      { category: '심폐지구력 평가', method: '스텝 검사' },
      { category: '체지방지수 평가', method: 'BMI' },
    ]

    const renderPage = (pageData: typeof classData, pageNum: number, totalPages: number) => `
      <div class="page">
        <div class="header">
          <div class="header-left">
            ATV PAPS Care
          </div>
          <div class="header-center">스마트 PAPS 측정 결과</div>
          <div class="header-right">${schoolName || '-'}</div>
        </div>

        <div class="sub-header">
          <div class="sub-title">${grade}학년 ${classNo}반 전체 기록지</div>
          <div class="sub-date">${dateStr}</div>
        </div>

        <table class="main-table">
          <thead>
            <tr>
              <th rowspan="2" class="col-no">번호</th>
              <th rowspan="2" class="col-name">이름</th>
              ${exerciseHeaders.map(h => `<th colspan="1" class="col-exercise">${h.category}<br/><small>${h.method}</small></th>`).join('')}
              <th rowspan="2" class="col-total">종합 평가</th>
            </tr>
            <tr>
              ${exerciseHeaders.map(() => `<th class="col-sub"></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${pageData.map(d => `
              <tr>
                <td class="cell-no">${d.num}</td>
                <td class="cell-name">${d.name}</td>
                ${d.items.map((item, i) => `
                  <td class="cell-data">
                    <div class="grade-row">${item.result ? `<span class="grade-badge" style="background:${gradeBgPrint(item.result.gradeNo)};color:${gradeColorPrint(item.result.gradeNo)}">${item.label}</span>` : '<span class="no-data">-</span>'}</div>
                    <div class="measure-row">${d.measureValues[i]}</div>
                  </td>
                `).join('')}
                <td class="cell-total">${d.finalGrade ? `<span class="total-grade" style="background:${gradeBgPrint(d.finalGrade)};color:${gradeColorPrint(d.finalGrade)}">${d.finalGrade}등급</span>` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-page">-${pageNum}페이지-</div>
          <div class="footer-url">https://spopark.kr</div>
        </div>
      </div>
    `

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>PAPS 학급 전체 기록지 - ${grade}학년 ${classNo}반</title>
<style>
  @page { size: A4 landscape; margin: 8mm 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: #1f2937; background: #fff; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .page { page-break-after: always; padding: 4px 0; display: flex; flex-direction: column; height: 100vh; }
  .page:last-child { page-break-after: avoid; }

  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 3px solid #e11d48; margin-bottom: 6px; }
  .header-left { display: inline-block; background: #e11d48; color: #fff; font-weight: 900; font-size: 12px; padding: 4px 12px; border-radius: 5px; letter-spacing: 0.5px; }
  .header-center { font-size: 16px; font-weight: 800; color: #e11d48; }
  .header-right { font-size: 13px; font-weight: 700; color: #374151; }

  .sub-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .sub-title { font-size: 14px; font-weight: 800; color: #1f2937; }
  .sub-date { font-size: 12px; color: #6b7280; }

  .main-table { width: 100%; border-collapse: collapse; flex: 1; table-layout: fixed; }
  .main-table th, .main-table td { border: 1px solid #d1d5db; text-align: center; vertical-align: middle; }
  .main-table thead th { background: #f9fafb; font-weight: 700; padding: 5px 2px; font-size: 10px; color: #374151; }
  .main-table thead th small { font-weight: 500; color: #6b7280; font-size: 9px; display: block; margin-top: 1px; }
  .col-no { width: 32px; }
  .col-name { width: 52px; }
  .col-exercise { }
  .col-sub { height: 0; padding: 0 !important; border-top: none !important; }
  .col-total { width: 58px; }

  .main-table tbody td { padding: 3px 2px; font-size: 10px; }
  .cell-no { font-weight: 700; font-size: 11px; background: #f9fafb; }
  .cell-name { font-weight: 600; font-size: 11px; background: #f9fafb; }
  .cell-data { }
  .grade-row { margin-bottom: 1px; }
  .grade-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; }
  .measure-row { font-size: 9px; color: #1f2937; font-weight: 600; }
  .no-data { color: #d1d5db; }
  .cell-total { font-weight: 800; font-size: 12px; }
  .total-grade { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; }

  .footer { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; padding-top: 4px; border-top: 1px solid #e5e7eb; }
  .footer-page { font-size: 10px; color: #9ca3af; flex: 1; text-align: center; }
  .footer-url { font-size: 10px; color: #9ca3af; }

  @media print {
    .page { height: auto; min-height: 100vh; }
  }
</style>
</head>
<body>
${pages.map((pageData, i) => renderPage(pageData, i + 1, pages.length)).join('')}
</body>
</html>`

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }

    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    }, 500)
  }

  // 엑셀 출력 핸들러
  const handleExcelExport = (origIdx: number) => {
    const headers = [
      '학년', '반명', '번호', '학생성명',
      '윗몸 말아 올리기 (회)',
      '제자리 멀리뛰기 (cm)1차', '제자리 멀리뛰기 (cm)2차',
      '앉아 윗몸앞으로 굽히기(cm) 1차', '앉아 윗몸앞으로 굽히기(cm) 2차',
      'Step 검사(1min)', 'Step 검사(2min)', 'Step 검사(3min)',
      'BMI', '신장(cm)', '체중(kg)'
    ]

    const dataRows = Array.from({ length: 30 }, (_, idx) => {
      const num = idx + 1
      const student = students.find(s => s.student_no === num) || null
      const record = rows.find(r => r.student_no === num) || null

      const muscular = record?.muscular_endurance[origIdx]
      const power1 = record?.power_1[origIdx]
      const power2 = record?.power_2[origIdx]
      const flex1 = record?.flexibility_1[origIdx]
      const flex2 = record?.flexibility_2[origIdx]
      const cardio1 = record?.cardio_1min[origIdx]
      const cardio2 = record?.cardio_2min[origIdx]
      const cardio3 = record?.cardio_3min[origIdx]
      const bmi = record?.bmi[origIdx]
      const heightCm = student?.height_cm
      const weightKg = student?.weight_kg

      return [
        grade,
        `${classNo}반`,
        num,
        student?.name ?? `${num}번 학생`,
        muscular !== null && muscular !== undefined ? Math.round(Number(muscular)) : '',
        power1 !== null && power1 !== undefined ? Number(power1) : '',
        power2 !== null && power2 !== undefined ? Number(power2) : '',
        flex1 !== null && flex1 !== undefined ? Number(flex1) : '',
        flex2 !== null && flex2 !== undefined ? Number(flex2) : '',
        cardio1 !== null && cardio1 !== undefined ? Number(cardio1) : '',
        cardio2 !== null && cardio2 !== undefined ? Number(cardio2) : '',
        cardio3 !== null && cardio3 !== undefined ? Number(cardio3) : '',
        bmi !== null && bmi !== undefined ? Number(Number(bmi).toFixed(2)) : '',
        heightCm !== null && heightCm !== undefined ? Number(heightCm) : '',
        weightKg !== null && weightKg !== undefined ? Number(weightKg) : '',
      ]
    })

    const wsData = [headers, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // 열 너비 설정
    ws['!cols'] = [
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 },
      { wch: 18 }, { wch: 20 }, { wch: 20 },
      { wch: 26 }, { wch: 26 },
      { wch: 16 }, { wch: 16 }, { wch: 16 },
      { wch: 8 }, { wch: 10 }, { wch: 10 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PAPS')

    const fileName = `PAPS_${grade}학년${classNo}반_${origIdx + 1}월_${year}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PAPS 기록 관리</h1>
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

      {/* 탭 메뉴: 기록 / 등급 + 결과지 출력 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-full overflow-hidden border border-white/70 shadow">
          <button
            onClick={() => setView('record')}
            className={`px-6 py-2 text-sm font-semibold transition ${view === 'record' ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            기록
          </button>
          <button
            onClick={() => setView('grade')}
            className={`px-6 py-2 text-sm font-semibold transition ${view === 'grade' ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
          >
            등급
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrintTypeModal(true)}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 border border-gray-300 shadow hover:bg-gray-50 transition flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            결과지 출력
          </button>
          <button
            onClick={() => setShowExcelModal(true)}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white border border-emerald-700 shadow hover:bg-emerald-700 transition flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            엑셀 출력
          </button>
        </div>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6 text-gray-900">
        {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

        {view === 'record' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 w-16 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
                  <th className="px-3 py-2 w-32 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                  <th className="px-2 py-2 w-24 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
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
                  const mergedRowSpan = recordFields.length

                  return (
                    <React.Fragment key={num}>
                      {recordFields.map((field, fieldIdx) => {
                        return (
                          <tr key={`${num}-${field.key}`} className={`${field.bgClass} h-[42px]`}>
                            {fieldIdx === 0 && (
                              <>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center bg-gray-50 border-b border-gray-200" rowSpan={mergedRowSpan}>{num}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center bg-gray-50 border-b border-gray-200" rowSpan={mergedRowSpan}>
                                  {s ? s.name : `${num}번 학생`}
                                </td>
                              </>
                            )}
                            <td className={`px-2 py-2 whitespace-nowrap text-xs text-center font-semibold ${field.textClass}`}>{field.label}</td>
                            {monthOrderIdx.map((origIdx, i) => {
                              return (
                                <td key={i} className="px-1 py-1 whitespace-nowrap text-sm text-center text-gray-900" style={{ width: monthCellPx }}>
                                  {r ? field.render(r, origIdx) : '-'}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* 등급 탭 */
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 w-16 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
                  <th className="px-3 py-2 w-28 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                  <th className="px-2 py-2 w-24 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
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
                  const mergedRowSpan = gradeFields.length + 1

                  const studentInfo = students.find(st => st.student_no === num) || null
                  const gender = studentInfo?.gender ?? null

                  const fieldResults = gradeFields.map(field => {
                    const ref = findGradeRef(field.exerciseId, grade, gender)
                    const results = monthOrderIdx.map((origIdx) => {
                      const v = r ? field.getValue(r, origIdx) : null
                      if (v === null || v === undefined || !ref) return null
                      const res = calcGradeAndScore(Number(v), ref)
                      if (!res) return null
                      if (field.exerciseId === 5) {
                        const bmi = getBmiResult(res.score)
                        return { gradeNo: bmi.gradeNo, score: bmi.score, label: bmi.label }
                      }
                      return { ...res, label: `${res.gradeNo}등급` }
                    })
                    return { field, results }
                  })

                  const monthTotals = Array.from({ length: 12 }, (_, mIdx) => {
                    const scores = fieldResults.map(fr => fr.results[mIdx]?.score ?? null)
                    if (scores.every(s => s === null)) return null
                    return scores.reduce((acc, s) => (acc ?? 0) + (s ?? 0), 0 as number | null)
                  })

                  const getMonthGrade = (totalScore: number | null) => {
                    if (totalScore === null) return null
                    if (totalScore < 20) return 5
                    if (totalScore < 40) return 4
                    if (totalScore < 60) return 3
                    if (totalScore < 80) return 2
                    return 1
                  }

                  return (
                    <React.Fragment key={num}>
                      {fieldResults.map(({ field, results }, fieldIdx) => (
                        <tr key={`${num}-${field.key}`} className={`${field.bgClass} h-[42px]`}>
                          {fieldIdx === 0 && (
                            <>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center bg-gray-50 border-b border-gray-200" rowSpan={mergedRowSpan}>{num}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 align-middle text-center bg-gray-50 border-b border-gray-200" rowSpan={mergedRowSpan}>
                                {s ? s.name : `${num}번 학생`}
                              </td>
                            </>
                          )}
                          <td className={`px-2 py-2 whitespace-nowrap text-xs text-center font-semibold ${field.textClass}`}>{field.label}</td>
                          {results.map((res, mIdx) => (
                            <td key={mIdx} className="px-1 py-1 whitespace-nowrap text-xs text-center" style={{ width: monthCellPx }}>
                              {res !== null ? (
                                <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-bold ${gradeColor(res.gradeNo)}`}>
                                  {res.label}
                                </span>
                              ) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {/* 합계 점수 요약 행 */}
                      <tr className="bg-gray-300 h-[42px] border-t-2 border-amber-300 border-b border-gray-200">
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-center font-semibold text-gray-700">합계</td>
                        {monthTotals.map((total, mIdx) => {
                          const g = getMonthGrade(total)
                          return (
                            <td key={mIdx} className="px-2 py-1 whitespace-nowrap text-center" style={{ width: monthCellPx }}>
                              {g !== null ? (
                                <span className={`text-[15px] font-black ${gradeTextColor(g)}`}>
                                  {g}등급
                                </span>
                              ) : '-'}
                            </td>
                          )
                        })}
                      </tr>
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 결과지 출력 모달 */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPrintModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">결과지 출력</h2>
              <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 text-left text-xs font-semibold text-gray-500 w-12">번호</th>
                    <th className="py-2 text-left text-xs font-semibold text-gray-500">이름</th>
                    <th className="py-2 text-center text-xs font-semibold text-gray-500 w-28">월 선택</th>
                    <th className="py-2 text-right text-xs font-semibold text-gray-500 w-20">출력</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 30 }, (_, idx) => {
                    const num = idx + 1
                    const st = students.find(s => s.student_no === num) || null

                    // 데이터가 있는 월 리스트 (monthOrderIdx 순서대로)
                    const availableMonths = monthOrderIdx.filter(origIdx => hasStudentData(num, origIdx))
                    const hasAnyData = availableMonths.length > 0

                    const currentOrigIdx = studentPrintMonths[num] ?? (hasAnyData ? availableMonths[0] : 2)
                    const isCurrentEmpty = !hasStudentData(num, currentOrigIdx)

                    return (
                      <tr key={num} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-2.5 text-sm font-semibold text-gray-700">{num}</td>
                        <td className="py-2.5 text-sm text-gray-900">{st ? st.name : `${num}번 학생`}</td>
                        <td className="py-2.5 text-center">
                          {hasAnyData ? (
                            <select
                              value={currentOrigIdx}
                              onChange={(e) => {
                                const val = Number(e.target.value)
                                setStudentPrintMonths(prev => ({ ...prev, [num]: val }))
                              }}
                              className="h-8 px-2 rounded border border-gray-300 text-xs font-medium text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-300"
                            >
                              {availableMonths.map(origIdx => (
                                <option key={origIdx} value={origIdx}>
                                  {origIdx + 1}월
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => handlePrintStudent(num, currentOrigIdx)}
                            disabled={isCurrentEmpty}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition shadow-sm ${isCurrentEmpty
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-amber-500 text-white hover:bg-amber-600'
                              }`}
                          >
                            출력
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 출력 유형 선택 모달 */}
      {showPrintTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPrintTypeModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">출력 유형 선택</h2>
              <button onClick={() => setShowPrintTypeModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowPrintTypeModal(false)
                  setShowPrintModal(true)
                }}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition group"
              >
                <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center text-2xl group-hover:bg-amber-200 transition">
                  👤
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900 text-sm">학생 개인</div>
                  <div className="text-xs text-gray-500 mt-0.5">학생별 개별 결과지를 출력합니다</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowPrintTypeModal(false)
                  setShowClassPrintModal(true)
                }}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition group"
              >
                <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center text-2xl group-hover:bg-indigo-200 transition">
                  👥
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900 text-sm">학급 전체</div>
                  <div className="text-xs text-gray-500 mt-0.5">학급 전체 기록지를 출력합니다</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 학급 전체 출력 모달 */}
      {showClassPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowClassPrintModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">학급 전체 기록지 출력</h2>
              <button onClick={() => setShowClassPrintModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-6">
              <div className="mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">대상 학급</div>
                <div className="text-lg font-bold text-gray-900">{grade}학년 {classNo}반</div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">출력할 월 선택</label>
                <select
                  value={classPrintMonth}
                  onChange={(e) => setClassPrintMonth(Number(e.target.value))}
                  className="w-full h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {monthOrderIdx.map(origIdx => (
                    <option key={origIdx} value={origIdx}>{origIdx + 1}월</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClassPrintModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    setShowClassPrintModal(false)
                    handlePrintClassAll(classPrintMonth)
                  }}
                  className="flex-1 px-4 py-3 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  출력
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 출력 모달 */}
      {showExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowExcelModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">엑셀 파일 다운로드</h2>
              <button onClick={() => setShowExcelModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-6">
              <div className="mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">대상 학급</div>
                <div className="text-lg font-bold text-gray-900">{grade}학년 {classNo}반</div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">다운로드할 월 선택</label>
                <select
                  value={excelMonth}
                  onChange={(e) => setExcelMonth(Number(e.target.value))}
                  className="w-full h-12 px-4 rounded-lg border-2 border-emerald-400 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  {monthOrderIdx.map(origIdx => (
                    <option key={origIdx} value={origIdx}>{origIdx + 1}월</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExcelModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    setShowExcelModal(false)
                    handleExcelExport(excelMonth)
                  }}
                  className="flex-1 px-4 py-3 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  다운로드
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
