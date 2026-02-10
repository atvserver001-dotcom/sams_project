"use client"

import React, { useCallback, useEffect, useState } from 'react'

type Gender = 'M' | 'F'

interface StudentRow {
  id: string
  year: number
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

export default function StudentsPage() {
  const [grade, setGrade] = useState<number>(1)
  const [classNo, setClassNo] = useState<number>(1)
  // 학년도: 3~12월은 해당 연도, 1~2월은 전년도
  const computeDefaultYear = () => {
    const now = new Date()
    const m = now.getMonth() + 1
    return (m === 1 || m === 2) ? now.getFullYear() - 1 : now.getFullYear()
  }
  const [year, setYear] = useState<number>(computeDefaultYear())
  const [schoolType, setSchoolType] = useState<1 | 2 | 3>(1)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StudentRow | null>(null)
  // 학교 정보 로드 (school_type)
  useEffect(() => {
    const loadSchool = async () => {
      try {
        const res = await fetch('/api/school/info', { credentials: 'include' })
        const data = await res.json()
        if (res.ok && data?.school?.school_type) {
          const t = Number(data.school.school_type)
          if (t === 1 || t === 2 || t === 3) {
            setSchoolType(t as 1 | 2 | 3)
            // 학년/반 기본값을 유효 범위로 보정
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


  const fetchStudents = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/school/students?year=${year}&grade=${grade}&class_no=${classNo}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '학생 조회 실패')
      setStudents(data.students as StudentRow[])
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
    } finally {
    }
  }, [year, grade, classNo])



  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  const openEdit = (row: StudentRow) => {
    setEditTarget(row)
    setDialogOpen(true)
  }


  const openCreateWithNumber = (studentNo: number) => {
    setEditTarget({
      id: '', // New student, no ID yet
      year,
      grade,
      class_no: classNo,
      student_no: studentNo,
      name: `${studentNo}번 학생`,
      gender: null,
      birth_date: '',
      email: '',
      height_cm: null,
      weight_kg: null,
      notes: '',
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 text-gray-900">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold  text-white">학생 정보입력</h1>
        <div></div>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-indigo-700 mb-1">년도</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
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
              onChange={(e) => setGrade(Number(e.target.value))}
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
              onChange={(e) => setClassNo(Number(e.target.value))}
              className="block w-36 h-12 px-4 rounded-lg border-2 border-indigo-300 bg-white shadow text-lg font-semibold text-center text-gray-900 focus:outline-none outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 hover:border-indigo-300 active:border-indigo-300"
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}반</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      <div className="bg-white/95 rounded-lg shadow p-6">

        {error && (
          <div className="mb-4 text-sm text-red-600">{error}</div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 w-16 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
                <th className="px-3 py-2 w-32 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                <th className="px-3 py-2 w-16 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">성별</th>
                <th className="px-3 py-2 w-32 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">생년월일</th>
                <th className="px-3 py-2 w-56 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
                <th className="px-3 py-2 w-24 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">키(cm)</th>
                <th className="px-3 py-2 w-28 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">몸무게(kg)</th>
                <th className="px-3 py-2 w-auto text-left text-xs font-medium text-gray-500 uppercase tracking-wider">특이사항</th>
                <th className="px-2 py-2 w-28"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array.from({ length: 30 }).map((_, idx) => {
                const num = idx + 1
                const s = students.find(st => st.student_no === num)
                if (s) {
                  return (
                    <tr key={num} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{s.student_no}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{s.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{s.gender === 'M' ? '남' : s.gender === 'F' ? '여' : '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{s.birth_date ?? '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{s.email ?? '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{s.height_cm ?? '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{s.weight_kg ?? '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-900 truncate max-w-[1px]">{s.notes ?? '-'}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-right text-sm">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => openEdit(s)}
                            className="px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-100"
                          >
                            수정
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={num} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{num}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{`${num}번 학생`}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400">-</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400">-</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400">-</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400">-</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-400">-</td>
                    <td className="px-3 py-2 text-sm text-gray-400">-</td>
                    <td className="px-2 py-2 whitespace-nowrap text-right text-sm">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => openCreateWithNumber(num)}
                          className="px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-100"
                        >
                          수정
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialogOpen && (
        <StudentDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          initial={editTarget}
          year={year}
          grade={grade}
          classNo={classNo}
          onSaved={async () => {
            setDialogOpen(false)
            await fetchStudents()
          }}
        />
      )}
    </div>
  )
}

interface StudentDialogProps {
  open: boolean
  onClose: () => void
  initial: StudentRow | null
  year: number
  grade: number
  classNo: number
  onSaved: () => Promise<void> | void
}

function StudentDialog({ open, onClose, initial, year, grade, classNo, onSaved }: StudentDialogProps) {
  const isEdit = Boolean(initial && initial.id)
  interface StudentForm {
    year: number
    grade: number
    class_no: number
    student_no: string
    name: string
    gender: '' | Gender
    birth_date: string
    email: string
    height_cm: string
    weight_kg: string
    notes: string
  }
  const [form, setForm] = useState<StudentForm>({
    year,
    grade,
    class_no: classNo,
    student_no: initial && initial.student_no != null ? String(initial.student_no) : '',
    name: initial?.name ?? '',
    gender: (initial?.gender ?? '') as '' | Gender,
    birth_date: initial?.birth_date ?? '',
    email: initial?.email ?? '',
    height_cm: initial && initial.height_cm != null ? String(initial.height_cm) : '',
    weight_kg: initial && initial.weight_kg != null ? String(initial.weight_kg) : '',
    notes: initial?.notes ?? '',
  })

  useEffect(() => {
    setForm((prev) => ({ ...prev, year, grade, class_no: classNo }))
  }, [year, grade, classNo])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'year') {
      const parsed = Number(value)
      setForm((prev) => ({ ...prev, year: Number.isFinite(parsed) ? parsed : prev.year }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // 숫자만 허용 (정수)
  const handleIntChange = (name: 'student_no', raw: string) => {
    const onlyDigits = raw.replace(/\D+/g, '')
    if (onlyDigits === '') {
      setForm((prev) => ({ ...prev, [name]: '' }))
      return
    }
    let num = parseInt(onlyDigits, 10)
    if (!Number.isFinite(num)) num = 1
    if (num < 1) num = 1
    if (num > 30) num = 30
    setForm((prev) => ({ ...prev, [name]: String(num) }))
  }

  // 숫자와 소수점 하나만 허용 (실수)
  const handleDecimalChange = (name: 'height_cm' | 'weight_kg', raw: string) => {
    let sanitized = raw.replace(/[^0-9.]+/g, '')
    const firstDot = sanitized.indexOf('.')
    if (firstDot !== -1) {
      // 첫 번째 소수점만 유지
      sanitized = sanitized.slice(0, firstDot + 1) + sanitized.slice(firstDot + 1).replace(/\./g, '')
    }
    // 소수점 둘째 자리까지만 허용
    if (sanitized.includes('.')) {
      const [intPart, fracRaw] = sanitized.split('.')
      const fracPart = (fracRaw || '').slice(0, 2)
      sanitized = fracPart.length > 0 ? `${intPart}.${fracPart}` : `${intPart}.`
    }
    setForm((prev) => ({ ...prev, [name]: sanitized }))
  }

  const submit = async () => {
    // 간단 검증
    if (!form.name || !form.student_no) {
      alert('이름과 번호는 필수입니다.')
      return
    }

    // 공통 검증: 번호 1~30 범위 확인
    const parsedNo = Number(form.student_no)
    if (!Number.isFinite(parsedNo) || parsedNo < 1 || parsedNo > 30) {
      alert('번호는 1~30 사이여야 합니다.')
      return
    }

    const payload = {
      year: Number(form.year),
      grade: Number(form.grade),
      class_no: Number(form.class_no),
      student_no: form.student_no === '' ? undefined : Number(form.student_no),
      name: form.name,
      gender: form.gender || null,
      birth_date: form.birth_date || null,
      email: form.email || null,
      height_cm: form.height_cm === '' ? null : Number(form.height_cm),
      weight_kg: form.weight_kg === '' ? null : Number(form.weight_kg),
      notes: form.notes || null,
    }

    // 번호 변경 여부 (기존 번호가 있었을 때만 비교)
    const originalNo = initial && initial.student_no != null ? initial.student_no : null
    const numberChanged = originalNo != null && originalNo !== parsedNo

    // 번호가 변경되고, 수정 모드일 때에는 충돌 번호가 있어도 "이동" 되도록 처리
    if (isEdit && numberChanged && initial) {
      // 현재 학급의 학생 목록 조회
      let list: StudentRow[] = []
      try {
        const listRes = await fetch(`/api/school/students?year=${year}&grade=${grade}&class_no=${classNo}`, { credentials: 'include' })
        const listData = await listRes.json().catch(() => ({}))
        list = Array.isArray(listData.students) ? listData.students : []
      } catch {
        list = []
      }

      const currentId = initial.id
      const target = list.find(st => st.student_no === parsedNo && st.id !== currentId) || null

      if (target) {
        // 대상 번호에 이미 학생이 있는 경우: 번호 스왑 처리
        // 1) 사용 가능한 임시 번호(buffer)를 찾는다 (1~50 범위)
        let bufferNo: number | null = null
        for (let n = 1; n <= 50; n++) {
          if (!list.some(st => st.student_no === n)) {
            bufferNo = n
            break
          }
        }

        if (bufferNo == null) {
          alert('번호를 이동할 수 없습니다. (사용 가능한 번호가 없습니다.)')
          return
        }

        // 2) 대상 학생을 buffer 번호로 이동
        const patchTargetToBuffer = await fetch(`/api/school/students/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_no: bufferNo }),
          credentials: 'include',
        }).then(r => r.json().then(d => ({ ok: r.ok, data: d })).catch(() => ({ ok: r.ok, data: {} })))

        if (!patchTargetToBuffer.ok) {
          alert(patchTargetToBuffer.data?.error || '번호 이동 중 오류가 발생했습니다. (1단계)')
          return
        }

        // 3) 현재 학생을 새로운 번호(parsedNo)로 이동
        const patchCurrentToNew = await fetch(`/api/school/students/${currentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        }).then(r => r.json().then(d => ({ ok: r.ok, data: d })).catch(() => ({ ok: r.ok, data: {} })))

        if (!patchCurrentToNew.ok) {
          alert(patchCurrentToNew.data?.error || '번호 이동 중 오류가 발생했습니다. (2단계)')
          return
        }

        // 4) 대상 학생을 원래 번호(originalNo)로 이동
        const patchTargetToOriginal = await fetch(`/api/school/students/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_no: originalNo }),
          credentials: 'include',
        }).then(r => r.json().then(d => ({ ok: r.ok, data: d })).catch(() => ({ ok: r.ok, data: {} })))

        if (!patchTargetToOriginal.ok) {
          alert(patchTargetToOriginal.data?.error || '번호 이동 중 오류가 발생했습니다. (3단계)')
          return
        }

        // 성공 안내 팝업
        alert(`번호 변경을 하였습니다.\n${parsedNo} 번의 데이터는 ${originalNo} 번이 됩니다.`)
        await onSaved()
        return
      }
    }

    // 신규 생성(학생데이터가 없던 번호에서 시작) + 번호 변경인 경우에도
    // 대상 번호에 학생이 있으면 스왑되도록 처리
    if (!isEdit && numberChanged && originalNo != null) {
      let list: StudentRow[] = []
      try {
        const listRes = await fetch(`/api/school/students?year=${year}&grade=${grade}&class_no=${classNo}`, { credentials: 'include' })
        const listData = await listRes.json().catch(() => ({}))
        list = Array.isArray(listData.students) ? listData.students : []
      } catch {
        list = []
      }

      const target = list.find(st => st.student_no === parsedNo) || null

      if (target) {
        // 1) 대상 학생을 원래 번호(originalNo)로 이동
        const patchTargetToOriginal = await fetch(`/api/school/students/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_no: originalNo }),
          credentials: 'include',
        }).then(r => r.json().then(d => ({ ok: r.ok, data: d })).catch(() => ({ ok: r.ok, data: {} })))

        if (!patchTargetToOriginal.ok) {
          alert(patchTargetToOriginal.data?.error || '번호 이동 중 오류가 발생했습니다. (대상 이동)')
          return
        }

        // 2) 새 학생을 변경된 번호(parsedNo)로 생성
        const createNew = await fetch('/api/school/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        }).then(r => r.json().then(d => ({ ok: r.ok, data: d })).catch(() => ({ ok: r.ok, data: {} })))

        if (!createNew.ok) {
          alert(createNew.data?.error || '번호 이동 중 오류가 발생했습니다. (신규 생성)')
          return
        }

        alert(`번호 변경을 하였습니다.\n${parsedNo} 번의 데이터는 ${originalNo} 번이 됩니다.`)
        await onSaved()
        return
      }
    }

    // 여기까지 왔다는 것은
    // 1) 신규 생성이거나
    // 2) 번호 변경이 없거나
    // 3) 번호 변경이지만 대상 번호에 학생이 없어서 단순 PATCH/POST & placeholder 처리만 하면 되는 경우

    let res: Response
    if (isEdit && initial) {
      res = await fetch(`/api/school/students/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
    } else {
      res = await fetch('/api/school/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.error || '저장에 실패했습니다.')
      return
    }

    // 번호만 이동하는 경우(대상 번호가 비어 있던 경우): 원래 번호 자리에 placeholder 학생 생성
    if (numberChanged && originalNo != null) {
      alert(`번호 변경을 하였습니다.\n${parsedNo} 번의 데이터는 ${originalNo} 번이 됩니다.`)

      try {
        const placeholderPayload = {
          year: Number(form.year),
          grade: Number(form.grade),
          class_no: Number(form.class_no),
          student_no: originalNo,
          // 이동 "당한" 번호(원래 비어있던 번호)를 그대로 유지하기 위해
          // placeholder의 이름은 변경 후 번호(parsedNo)를 기준으로 표시
          // 예) 5번 홍길동 -> 6번으로 이동 시, 5번 자리에 "6번 학생" 생성
          name: `${parsedNo}번 학생`,
          gender: null,
          birth_date: null,
          email: null,
          height_cm: null,
          weight_kg: null,
          notes: null,
        }

        await fetch('/api/school/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(placeholderPayload),
          credentials: 'include',
        }).then(r => r.json().catch(() => ({})))
        // 이미 존재(중복키)하는 경우 등은 조용히 무시
      } catch {
        // 보조 처리 실패는 전체 저장 실패로 보지 않음
      }
    }

    await onSaved()
  }

  const handleDeleteAll = async () => {
    if (!isEdit || !initial) return
    const confirmed = confirm('해당 학생의 학생 데이터와 관련 운동기록이 모두 삭제됩니다.\n정말 삭제하시겠습니까?')
    if (!confirmed) return

    try {
      const res = await fetch(`/api/school/students/${initial.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '삭제 중 오류가 발생했습니다.')
        return
      }
      alert('학생 데이터와 관련 운동기록이 모두 삭제되었습니다.')
      await onSaved()
    } catch {
      alert('삭제 중 알 수 없는 오류가 발생했습니다.')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-5 overflow-hidden">
        <div className="relative mb-4 text-center">
          <h3 className="text-lg font-semibold text-gray-900">{isEdit ? '학생 정보 수정' : '학생 추가'}</h3>
          <button onClick={onClose} className="absolute right-0 top-0 text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">년도</label>
            <input name="year" value={form.year} onChange={handleChange} type="number" className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">번호</label>
            <input
              name="student_no"
              value={form.student_no}
              onChange={(e) => handleIntChange('student_no', e.target.value)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input name="name" value={form.name} onChange={handleChange} className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">성별</label>
            <select name="gender" value={form.gender} onChange={handleChange} className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm">
              <option value="">선택</option>
              <option value="M">남</option>
              <option value="F">여</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">생년월일</label>
            <input name="birth_date" value={form.birth_date} onChange={handleChange} type="date" className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input name="email" value={form.email} onChange={handleChange} type="email" className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">키(cm)</label>
            <input name="height_cm" value={form.height_cm} onChange={(e) => handleDecimalChange('height_cm', e.target.value)} type="text" inputMode="decimal" pattern="^[0-9]*\.?[0-9]{0,2}$" className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">몸무게(kg)</label>
            <input name="weight_kg" value={form.weight_kg} onChange={(e) => handleDecimalChange('weight_kg', e.target.value)} type="text" inputMode="decimal" pattern="^[0-9]*\.?[0-9]{0,2}$" className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">특이사항</label>
            <input name="notes" value={form.notes} onChange={handleChange} maxLength={16} className="w-full h-10 px-3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            {isEdit && initial && (
              <button
                type="button"
                onClick={handleDeleteAll}
                className="px-4 py-2 rounded bg-[#cc1212] text-white hover:bg-[#a80000] text-sm font-semibold"
              >
                데이터 삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50">취소</button>
            <button onClick={submit} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">저장</button>
          </div>
        </div>
      </div>
    </div>
  )
}



