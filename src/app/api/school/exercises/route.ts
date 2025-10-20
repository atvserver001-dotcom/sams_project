export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'

type OperatorAccount = {
  id: string
  role: string
  school_id: string | null
  is_active: boolean
}

type AuthResult =
  | { account: OperatorAccount }
  | { error: string; status: 400 | 401 | 403 | 404 | 500 }

type StudentRow = {
  id: string
  student_no: number
  name: string
}

type ExerciseRecordRow = {
  student_id: string
  record_type: 1 | 2 | 3
  m01: number | null
  m02: number | null
  m03: number | null
  m04: number | null
  m05: number | null
  m06: number | null
  m07: number | null
  m08: number | null
  m09: number | null
  m10: number | null
  m11: number | null
  m12: number | null
}

async function getOperatorFromRequest(request: NextRequest): Promise<AuthResult> {
  const accessToken = request.cookies.get('op-access-token')?.value
  if (!accessToken) {
    return { error: '인증 토큰이 없습니다.', status: 401 as const }
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    return { error: '서버 설정 오류 (JWT_SECRET 누락)', status: 500 as const }
  }

  try {
    const decoded = jwt.verify(accessToken, jwtSecret) as any
    const { data: account, error } = await supabaseAdmin
      .from('operator_accounts')
      .select('id, role, school_id, is_active')
      .eq('id', decoded.sub)
      .maybeSingle<OperatorAccount>()

    if (error || !account) {
      return { error: '사용자를 찾을 수 없습니다.', status: 404 as const }
    }

    if (!account.is_active) {
      return { error: '비활성화된 계정입니다.', status: 403 as const }
    }

    // 관리자 acting 허용
    if (account.role === 'admin') {
      const actingSchoolId = request.cookies.get('acting_school_id')?.value || null
      if (!actingSchoolId) return { error: '관리자 acting 컨텍스트가 설정되지 않았습니다.', status: 403 as const }
      return { account: { ...account, school_id: actingSchoolId } }
    }

    if (account.role === 'school') {
      if (!account.school_id) return { error: '학교 정보가 누락되었습니다.', status: 400 as const }
      return { account }
    }

    return { error: '권한이 없습니다.', status: 403 as const }
  } catch {
    return { error: '유효하지 않은 세션입니다.', status: 401 as const }
  }
}

type ExerciseRow = {
  student_id: string
  student_no: number
  name: string
  minutes: (number | null)[]
  avg_bpm: (number | null)[]
  max_bpm: (number | null)[]
}

export async function GET(request: NextRequest) {
  const auth = await getOperatorFromRequest(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const schoolId = auth.account.school_id as string
  const { searchParams } = new URL(request.url)
  const gradeParam = searchParams.get('grade')
  const classNoParam = searchParams.get('class_no')
  const yearParam = searchParams.get('year')
  const categoryTypeParam = searchParams.get('category_type')

  if (!gradeParam || !classNoParam || !yearParam) {
    return NextResponse.json({ error: 'grade, class_no, year 쿼리 파라미터가 필요합니다.' }, { status: 400 })
  }

  const grade = Number(gradeParam)
  const class_no = Number(classNoParam)
  const year = Number(yearParam)
  let category_type: number | 'all' = 1
  if (categoryTypeParam === 'all') {
    category_type = 'all'
  } else if (categoryTypeParam != null) {
    const n = Number(categoryTypeParam)
    if (Number.isFinite(n)) {
      category_type = n as 1 | 2 | 3 | 4
    }
  }

  if (!Number.isFinite(grade) || !Number.isFinite(class_no) || !Number.isFinite(year)) {
    return NextResponse.json({ error: 'grade, class_no, year는 숫자여야 합니다.' }, { status: 400 })
  }

  const { data: students, error: studentsError } = await supabaseAdmin
    .from('students')
    .select('id, student_no, name')
    .eq('school_id', schoolId)
    .eq('grade', grade)
    .eq('class_no', class_no)
    .order('student_no', { ascending: true })
    .returns<StudentRow[]>()

  if (studentsError) {
    return NextResponse.json({ error: studentsError.message }, { status: 500 })
  }

  const studentIds = (students ?? []).map((s) => s.id)
  if (studentIds.length === 0) {
    return NextResponse.json({ rows: [] })
  }

  const baseQuery = supabaseAdmin
    .from('exercise_records')
    .select('*')
    .in('student_id', studentIds)
    .eq('year', year)

  const query = category_type === 'all'
    ? baseQuery.in('category_type', [1, 2, 3])
    : baseQuery.eq('category_type', category_type)

  const { data: records, error: recordsError } = await query.returns<ExerciseRecordRow[]>()

  if (recordsError) {
    return NextResponse.json({ error: recordsError.message }, { status: 500 })
  }

  const studentIdToRow: Record<string, ExerciseRow> = {}
  for (const s of students ?? []) {
    studentIdToRow[s.id] = {
      student_id: s.id,
      student_no: (s as any).student_no ?? 0,
      name: (s as any).name ?? '',
      minutes: Array.from({ length: 12 }, () => null),
      avg_bpm: Array.from({ length: 12 }, () => null),
      max_bpm: Array.from({ length: 12 }, () => null),
    }
  }

  // 평균 계산을 위한 누적 버퍼
  const avgSumMap: Record<string, number[]> = {}
  const avgCntMap: Record<string, number[]> = {}
  const ensureAvgBuffers = (studentId: string) => {
    if (!avgSumMap[studentId]) avgSumMap[studentId] = Array.from({ length: 12 }, () => 0)
    if (!avgCntMap[studentId]) avgCntMap[studentId] = Array.from({ length: 12 }, () => 0)
  }

  for (const r of records ?? []) {
    const row = studentIdToRow[r.student_id]
    if (!row) continue
    const values = [
      r.m01, r.m02, r.m03, r.m04, r.m05, r.m06,
      r.m07, r.m08, r.m09, r.m10, r.m11, r.m12,
    ].map((v: any) => (typeof v === 'number' ? v : v == null ? null : Number(v)))

    // 규약 변경: record_type 1=운동시간(분, 합계), 2=평균 심박(평균), 3=최대 심박(최댓값)
    if (r.record_type === 1) {
      for (let i = 0; i < 12; i++) {
        const current = row.minutes[i]
        const incoming = values[i]
        row.minutes[i] = current == null && incoming == null ? null : (current ?? 0) + (incoming ?? 0)
      }
    } else if (r.record_type === 2) {
      ensureAvgBuffers(r.student_id)
      for (let i = 0; i < 12; i++) {
        const v = values[i]
        if (typeof v === 'number') {
          avgSumMap[r.student_id][i] += v
          avgCntMap[r.student_id][i] += 1
        }
      }
    } else if (r.record_type === 3) {
      for (let i = 0; i < 12; i++) {
        const current = row.max_bpm[i]
        const incoming = values[i]
        if (incoming == null) continue
        row.max_bpm[i] = current == null ? incoming : Math.max(current, incoming)
      }
    }
  }

  // 평균 심박 산출
  for (const [studentId, row] of Object.entries(studentIdToRow)) {
    const sumArr = avgSumMap[studentId]
    const cntArr = avgCntMap[studentId]
    if (!sumArr || !cntArr) continue
    for (let i = 0; i < 12; i++) {
      const c = cntArr[i]
      row.avg_bpm[i] = c > 0 ? Math.round((sumArr[i] / c) * 10) / 10 : row.avg_bpm[i]
    }
  }

  const rows: ExerciseRow[] = Object.values(studentIdToRow).sort((a, b) => (a.student_no ?? 0) - (b.student_no ?? 0))
  return NextResponse.json({ rows })
}


