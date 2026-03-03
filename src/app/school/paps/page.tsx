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

type PapsViewMode = 'record' | 'grade'

interface PapsRow {
  student_id: string
  student_no: number
  name: string
  muscular_endurance: (number | null)[]
  power: (number | null)[]
  flexibility: (number | null)[]
  cardio_endurance: (number | null)[]
  bmi: (number | null)[]
  measured_at: (string | null)[]
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
// 각 등급은 4개의 임계값을 가짐 (오름차순)
// value >= gradeN[i] 이면 해당 등급의 i번째 sub-score
// value > grade1[3] 이면 최고점 20점
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

  // 1등급 최고값 초과 → 20점
  if (value > ref.grade1[3]) {
    return { gradeNo: 1, score: 20 }
  }

  for (const lvl of levels) {
    if (value >= lvl.arr[0]) {
      // 이 등급에 해당 → 위치 찾기 (내림차순으로 가장 높은 idx 찾기)
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

  // 5등급 최소값 미만 → 0점
  return { gradeNo: 5, score: 0 }
}

const BMI_SCORE_MAP = [13, 14, 15, 16, 17, 18, 19, 20, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

function getBmiResult(initialScore: number): { gradeNo: number; score: number; label: string } {
  // initialScore: 0~20 (기본 PAPS 점수)
  // BMI_SCORE_MAP: 20개 요소 (0~19 인덱스)
  // 20점인 경우 마지막 인덱스(1) 사용
  const score = BMI_SCORE_MAP[Math.min(19, initialScore)] ?? 1

  let label = "정상"
  let gradeNo = 1

  // BMI_Score == 0 또는 <= 4 이면 고도비만
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

// 등급 컬러 매핑
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
  const [printRoundIdx, setPrintRoundIdx] = useState(0) // 모달 통합용 (기본값)
  const [studentPrintRounds, setStudentPrintRounds] = useState<Record<number, number>>({}) // 각 학생별 선택 회차

  // 특정 학생의 특정 회차 데이터 유무 확인
  const hasStudentData = (studentNo: number, rIdx: number) => {
    const row = rows.find(r => r.student_no === studentNo)
    if (!row) return false
    return (
      row.muscular_endurance[rIdx] !== null ||
      row.power[rIdx] !== null ||
      row.flexibility[rIdx] !== null ||
      row.cardio_endurance[rIdx] !== null ||
      row.bmi[rIdx] !== null
    )
  }

  // 모달 열릴 때 초기 회차 설정 (데이터가 있는 마지막 회차)
  useEffect(() => {
    if (showPrintModal) {
      const defaults: Record<number, number> = {}
      students.forEach(s => {
        const num = s.student_no
        // 마지막 회차부터 거꾸로 순회하여 데이터가 있는 첫 번째(가장 높은 회차)를 찾음
        for (let i = 11; i >= 0; i--) {
          if (hasStudentData(num, i)) {
            defaults[num] = i
            break
          }
        }
      })
      setStudentPrintRounds(defaults)
    }
  }, [showPrintModal]) // eslint-disable-next-line react-hooks/exhaustive-deps

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

  // 등급 참조 데이터 로드 (최초 1회)
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
          power: [...empty12],
          flexibility: [...empty12],
          cardio_endurance: [...empty12],
          bmi: [...empty12],
          measured_at: [...empty12],
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

  // 회차 (1~12회차)
  const rounds = useMemo(() => Array.from({ length: 12 }, (_, i) => `${i + 1}회차`), [])
  const roundCellPx = 80

  const papsFields: { key: keyof PapsRow; label: string; bgClass: string; textClass: string; exerciseId: number }[] = [
    { key: 'measured_at', label: '측정날짜', bgClass: 'bg-gray-50', textClass: 'text-gray-700', exerciseId: 0 },
    { key: 'muscular_endurance', label: '근지구력', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', exerciseId: 1 },
    { key: 'power', label: '순발력', bgClass: 'bg-rose-50', textClass: 'text-rose-700', exerciseId: 2 },
    { key: 'flexibility', label: '유연성', bgClass: 'bg-teal-50', textClass: 'text-teal-700', exerciseId: 3 },
    { key: 'cardio_endurance', label: '심폐지구력', bgClass: 'bg-amber-50', textClass: 'text-amber-700', exerciseId: 4 },
    { key: 'bmi', label: '체질량지수', bgClass: 'bg-violet-50', textClass: 'text-violet-700', exerciseId: 5 },
  ]

  // 등급 참조 행 찾기
  // school_id 매핑: schoolType 1→1(초등), 2→2(중), 3→3(고)
  // sex 매핑: gender 'M'→1, 'F'→2
  const findGradeRef = (exerciseId: number, studentGrade: number, gender: Gender | null): GradeRefRow | null => {
    if (gradeRefs.length === 0) return null
    const sexCode = gender === 'M' ? 1 : gender === 'F' ? 2 : 0

    // 심폐지구력(4)은 공통(school_id=0, grade=0, sex=0)
    if (exerciseId === 4) {
      return gradeRefs.find(r => r.exercise_id === 4) ?? null
    }

    // 정확히 매칭
    const exact = gradeRefs.find(r =>
      r.exercise_id === exerciseId &&
      r.school_id === schoolType &&
      r.grade === studentGrade &&
      r.sex === sexCode
    )
    if (exact) return exact

    // fallback: school_id 매칭, grade 공통(0)
    const bySchool = gradeRefs.find(r =>
      r.exercise_id === exerciseId &&
      r.school_id === schoolType &&
      r.grade === 0 &&
      r.sex === sexCode
    )
    if (bySchool) return bySchool

    // fallback: 공통(0,0)
    return gradeRefs.find(r =>
      r.exercise_id === exerciseId &&
      r.school_id === 0 &&
      r.sex === 0
    ) ?? null
  }

  // 등급 표 필드 (측정날짜 제외, 등급 계산 대상만)
  const gradeFields = papsFields.filter(f => f.exerciseId > 0)

  // 항목별 한글 종목명 매핑 (결과지 출력용)
  const exerciseNames: Record<number, { category: string; method: string }> = {
    1: { category: '근력 / 근지구력 평가', method: '윗몸말아올리기' },
    2: { category: '순발력 평가', method: '제자리 멀리뛰기' },
    3: { category: '유연성 평가', method: '앉아 윗몸 앞으로 굽히기' },
    4: { category: '심폐지구력 평가', method: '스텝검사' },
    5: { category: '체지방 평가', method: '체질량지수 (BMI)' },
  }

  // 등급별 이모지 & 평가결과 텍스트
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
  const handlePrintStudent = (studentNo: number, selectedRoundIdx?: number) => {
    const student = students.find(s => s.student_no === studentNo) || null
    const record = rows.find(r => r.student_no === studentNo) || null
    const rIdx = selectedRoundIdx !== undefined ? selectedRoundIdx : printRoundIdx

    // 학생 성별
    const gender = student?.gender ?? null
    const genderLabel = gender === 'M' ? '남' : gender === 'F' ? '여' : '-'

    // 측정일
    const measuredDate = record?.measured_at?.[rIdx] || '-'

    // 신체정보
    const heightCm = student?.height_cm ?? '-'
    const weightKg = student?.weight_kg ?? '-'

    // 5개 항목별 등급/점수 계산
    const itemResults = gradeFields.map(field => {
      const ref = findGradeRef(field.exerciseId, grade, gender)
      const values = (record?.[field.key] as (number | null)[] | undefined) ?? []
      const v = values[rIdx]
      if (v === null || v === undefined || !ref) return { exerciseId: field.exerciseId, rawValue: v, result: null, label: '-' }

      const res = calcGradeAndScore(Number(v), ref)
      if (!res) return { exerciseId: field.exerciseId, rawValue: v, result: null, label: '-' }

      if (field.exerciseId === 5) {
        const bmi = getBmiResult(res.score)
        return { exerciseId: field.exerciseId, rawValue: v, result: { gradeNo: bmi.gradeNo, score: bmi.score }, label: bmi.label }
      }
      return { exerciseId: field.exerciseId, rawValue: v, result: res, label: `${res.gradeNo}등급` }
    })

    // 총점 계산
    const totalScore = itemResults.reduce((sum, item) => {
      return sum + (item.result?.score ?? 0)
    }, 0)
    const hasAnyData = itemResults.some(item => item.result !== null)

    // 최종 등급
    const finalGrade = !hasAnyData ? null
      : totalScore < 20 ? 5
        : totalScore < 40 ? 4
          : totalScore < 60 ? 3
            : totalScore < 80 ? 2
              : 1

    // 등급별 색상 (인쇄용)
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

    // 하단 5개 분류 조건 판정
    const powerResult = itemResults.find(i => i.exerciseId === 2)
    const cardioResult = itemResults.find(i => i.exerciseId === 4)
    const bmiResult = itemResults.find(i => i.exerciseId === 5)
    const allGrades = itemResults.map(i => i.result?.gradeNo ?? null)
    const allHaveGrade = allGrades.every(g => g !== null)

    // 스포츠 영재: 순발력 20점 AND 심폐지구력 20점
    const isSportsGifted = (powerResult?.result?.score === 20) && (cardioResult?.result?.score === 20)
    // 건강 체력 우수: 모든 종목 1등급
    const isHealthExcellent = allHaveGrade && allGrades.every(g => g === 1)
    // 체력 우수: 심폐지구력 1등급
    const isFitnessExcellent = cardioResult?.result?.gradeNo === 1
    // 저체력: 모든 등급 4~5등급
    const isLowFitness = allHaveGrade && allGrades.every(g => g !== null && g >= 4)
    // 비만: 체지방 4~5등급
    const isObese = bmiResult?.result?.gradeNo !== undefined && bmiResult?.result?.gradeNo !== null && bmiResult.result.gradeNo >= 4

    const greenCheck = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#22c55e"/><path d="M10 18.5l5.5 5.5L26 13" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const redX = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#ef4444"/><path d="M12 12l12 12M24 12l-12 12" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`
    const emptyCircle = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/></svg>`

    // HTML 생성
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>PAPS 측정 결과 - ${student?.name ?? studentNo + '번'}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; width: 100%; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: #1f2937; background: #fff; font-size: 13px; }
  .page { display: flex; flex-direction: column; min-height: 100vh; padding: 14px 18px; }

  /* 헤더 */
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 3px solid #e11d48; }
  .header-logo { display: flex; align-items: center; gap: 4px; }
  .header-logo .paps { background: #e11d48; color: #fff; font-weight: 900; font-size: 14px; padding: 3px 8px; border-radius: 4px; }
  .header-logo .manager { font-size: 15px; font-weight: 700; color: #e11d48; font-style: italic; }
  .header-title { font-size: 18px; font-weight: 800; color: #e11d48; }
  .header-school { font-size: 14px; font-weight: 700; color: #374151; }

  /* 학생 정보 */
  .info-bar { display: flex; align-items: center; gap: 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
  .info-no { font-size: 32px; font-weight: 900; color: #e11d48; min-width: 55px; text-align: center; line-height: 1; }
  .info-no small { font-size: 11px; display: block; color: #9ca3af; font-weight: 500; }
  .info-body { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; flex: 1; }
  .info-body .col { font-size: 13px; color: #374151; }
  .info-body .col b { font-weight: 700; }
  .info-right { margin-left: auto; display: flex; gap: 22px; font-size: 13px; color: #374151; }
  .info-right b { font-weight: 700; }

  /* 항목 카드 - flex-grow로 균등 분배 */
  .cats { display: flex; flex-direction: column; gap: 0; flex: 1; }
  .cat { flex: 1; display: flex; flex-direction: column; margin-bottom: 10px; }
  .cat-title { font-size: 14px; font-weight: 900; color: #1f2937; border-left: 4px solid #e11d48; padding-left: 8px; margin-bottom: 6px; }
  .cat-row { display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fff; flex: 1; }
  .cat-measure { flex: 1.3; padding: 10px 14px; background: #f9fafb; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center; }
  .cat-measure .m-label { font-size: 10px; color: #9ca3af; margin-bottom: 4px; }
  .cat-measure .m-val { display: inline-block; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 12px; font-size: 13px; font-weight: 600; }
  .cat-score { flex: 0.7; text-align: center; padding: 8px 0; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .cat-score .s-label { font-size: 10px; color: #9ca3af; }
  .cat-score .s-val { font-size: 26px; font-weight: 900; }
  .cat-grade { flex: 0.7; text-align: center; padding: 8px 0; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .cat-grade .g-label { font-size: 10px; color: #9ca3af; }
  .cat-grade .g-val { font-size: 17px; font-weight: 800; display: inline-block; padding: 3px 12px; border-radius: 5px; margin-top: 3px; }
  .cat-emoji { flex: 0.4; text-align: center; padding: 6px 0; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .cat-emoji .e-face { font-size: 32px; line-height: 1.1; }
  .cat-emoji .e-label { font-size: 10px; color: #6b7280; margin-top: 2px; }

  /* PAPS 평가 요약 */
  .paps-summary { margin-top: 14px; border: 2px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; background: #f9fafb; }
  .paps-summary h3 { font-size: 14px; font-weight: 900; margin-bottom: 12px; }
  .paps-summary .sum-row { display: flex; align-items: center; gap: 14px; }
  .sum-label { font-size: 13px; font-weight: 600; padding: 10px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .sum-score { font-size: 34px; font-weight: 900; flex: 1; text-align: center; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .sum-score span { font-size: 16px; font-weight: 500; color: #9ca3af; }
  .sum-grade { font-size: 22px; font-weight: 900; padding: 8px 20px; border-radius: 6px; border: 2px solid; }

  /* 하단 분류 배지 */
  .badges { display: flex; justify-content: space-around; margin-top: 14px; padding: 12px 0 4px 0; border-top: 1px solid #e5e7eb; }
  .badge-item { text-align: center; min-width: 70px; }
  .badge-item .b-icon { height: 32px; display: flex; align-items: center; justify-content: center; }
  .badge-item .b-label { font-size: 10px; font-weight: 700; color: #374151; margin-top: 4px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-logo"><span class="paps">PAPS</span><span class="manager">manager</span></div>
    <div class="header-title">스마트 PAPS 측정 결과</div>
    <div class="header-school">${schoolName || '-'}</div>
  </div>

  <div class="info-bar">
    <div class="info-no">${studentNo}<small>번</small></div>
    <div class="info-body">
      <div class="col"><b>학생 정보</b> | ${grade}학년 ${classNo}반 ${student?.name ?? studentNo + '번 학생'} (${genderLabel})</div>
      <div class="col"><b>측정 일자</b> | ${measuredDate}</div>
    </div>
    <div class="info-right">
      <div><b>체중</b> | ${weightKg}kg</div>
      <div><b>신장</b> | ${heightCm}cm</div>
    </div>
  </div>

  <div class="cats">
  ${itemResults.map(item => {
      if (!item.result) return '' // 데이터 없는 항목은 출력하지 않음
      const info = exerciseNames[item.exerciseId]
      const g = item.result.gradeNo
      const ej = gradeEmoji(g)
      return `
  <div class="cat">
    <div class="cat-title">${info.category}</div>
    <div class="cat-row">
      <div class="cat-measure">
        <div class="m-label">${info.method}</div>
        <div class="m-val">측정 기록: ${item.rawValue !== null ? item.rawValue : '-'}</div>
      </div>
      <div class="cat-score">
        <div class="s-label">평가 점수</div>
        <div class="s-val">${item.result.score ?? '-'}</div>
      </div>
      <div class="cat-grade">
        <div class="g-label">평가 결과</div>
        <div class="g-val" style="background:${gradeBgPrint(g)}; color:${gradeColorPrint(g)};">
          ${item.label}
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
      <div class="sum-score">${hasAnyData ? totalScore : '-'}<span>/100</span></div>
      <div class="sum-grade" style="background:${finalGrade ? gradeBgPrint(finalGrade) : '#f3f4f6'}; color:${finalGrade ? gradeColorPrint(finalGrade) : '#6b7280'}; border-color:${finalGrade ? gradeColorPrint(finalGrade) : '#d1d5db'};">
        ${finalGrade ? finalGrade + '등급' : '-'}
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

    // 숨겨진 iframe을 사용하여 인쇄 (새 창이 뜨는 플리커링 방지)
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

    // 인쇄 호출 및 완료 후 iframe 제거
    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    }, 500)
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
        <button
          onClick={() => setShowPrintModal(true)}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 border border-gray-300 shadow hover:bg-gray-50 transition flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          결과지 출력
        </button>
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
                  {rounds.map((r) => (
                    <th
                      key={r}
                      className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                      style={{ width: roundCellPx }}
                    >
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.from({ length: 30 }).map((_, idx) => {
                  const num = idx + 1
                  const s = students.find(st => st.student_no === num) || null
                  const r = rows.find(rr => rr.student_no === num) || null
                  const mergedRowSpan = papsFields.length // 필드 개수 (합계 제거)

                  return (
                    <React.Fragment key={num}>
                      {papsFields.map((field, fieldIdx) => {
                        const values = (r?.[field.key] as (number | string | null)[] | undefined) ?? Array.from({ length: 12 }, () => null)
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
                            {Array.from({ length: 12 }).map((_, rIdx) => {
                              const v = values[rIdx]
                              return (
                                <td key={rIdx} className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-900" style={{ width: roundCellPx }}>
                                  {v !== null ? v : '-'}
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
                  {rounds.map((r) => (
                    <th
                      key={r}
                      className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                      style={{ width: roundCellPx }}
                    >
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.from({ length: 30 }).map((_, idx) => {
                  const num = idx + 1
                  const s = students.find(st => st.student_no === num) || null
                  const r = rows.find(rr => rr.student_no === num) || null
                  const mergedRowSpan = gradeFields.length + 1 // 항목5 + 합계1 = 6행

                  // 학생 성별
                  const studentInfo = students.find(st => st.student_no === num) || null
                  const gender = studentInfo?.gender ?? null

                  // 각 항목별, 회차별 등급/점수 미리 계산
                  const fieldResults = gradeFields.map(field => {
                    const ref = findGradeRef(field.exerciseId, grade, gender)
                    const values = (r?.[field.key] as (number | null)[] | undefined) ?? Array.from({ length: 12 }, () => null as number | null)
                    const results = Array.from({ length: 12 }, (_, rIdx) => {
                      const v = values[rIdx]
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

                  // 회차별 합계 점수 (5개 항목 점수 합산)
                  const roundTotals = Array.from({ length: 12 }, (_, rIdx) => {
                    const scores = fieldResults.map(fr => fr.results[rIdx]?.score ?? null)
                    if (scores.every(s => s === null)) return null
                    return scores.reduce((acc, s) => (acc ?? 0) + (s ?? 0), 0 as number | null)
                  })

                  const getRoundGrade = (totalScore: number | null) => {
                    if (totalScore === null) return null
                    if (totalScore < 20) return 5
                    if (totalScore < 40) return 4
                    if (totalScore < 60) return 3
                    if (totalScore < 80) return 2
                    return 1
                  }

                  return (
                    <React.Fragment key={num}>
                      {/* 항목별 등급 행 */}
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
                          {results.map((res, rIdx) => (
                            <td key={rIdx} className="px-1 py-1 whitespace-nowrap text-xs text-center" style={{ width: roundCellPx }}>
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
                        {roundTotals.map((total, rIdx) => {
                          const g = getRoundGrade(total)
                          return (
                            <td key={rIdx} className="px-2 py-1 whitespace-nowrap text-center" style={{ width: roundCellPx }}>
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
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">결과지 출력</h2>
              <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>



            {/* 학생 리스트 */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 text-left text-xs font-semibold text-gray-500 w-12">번호</th>
                    <th className="py-2 text-left text-xs font-semibold text-gray-500">이름</th>
                    <th className="py-2 text-center text-xs font-semibold text-gray-500 w-28">회차 선택</th>
                    <th className="py-2 text-right text-xs font-semibold text-gray-500 w-20">출력</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 30 }, (_, idx) => {
                    const num = idx + 1
                    const st = students.find(s => s.student_no === num) || null

                    // 데이터가 있는 회차 리스트
                    const availableRounds = Array.from({ length: 12 }, (_, i) => i).filter(i => hasStudentData(num, i))
                    const hasAnyData = availableRounds.length > 0

                    const currentSRound = studentPrintRounds[num] ?? (hasAnyData ? availableRounds[0] : 0)
                    const isCurrentRoundEmpty = !hasStudentData(num, currentSRound)

                    return (
                      <tr key={num} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="py-2.5 text-sm font-semibold text-gray-700">{num}</td>
                        <td className="py-2.5 text-sm text-gray-900">{st ? st.name : `${num}번 학생`}</td>
                        <td className="py-2.5 text-center">
                          {hasAnyData ? (
                            <select
                              value={currentSRound}
                              onChange={(e) => {
                                const val = Number(e.target.value)
                                setStudentPrintRounds(prev => ({ ...prev, [num]: val }))
                              }}
                              className="h-8 px-2 rounded border border-gray-300 text-xs font-medium text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-300"
                            >
                              {availableRounds.map(i => (
                                <option key={i} value={i}>
                                  {i + 1}회차
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => handlePrintStudent(num, currentSRound)}
                            disabled={isCurrentRoundEmpty}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition shadow-sm ${isCurrentRoundEmpty
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

            {/* 모달 하단 */}
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
    </div>
  )
}
