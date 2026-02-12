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

type HeartRateMonthlyRow = {
  student_id: string
  year: number
  month: number
  avg_bpm: number | null
  max_bpm: number | null
  min_bpm: number | null
  record_count: number
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

type HeartRateRow = {
  student_id: string
  student_no: number
  name: string
  avg_bpm: (number | null)[]
  max_bpm: (number | null)[]
  min_bpm: (number | null)[]
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

  if (!gradeParam || !classNoParam || !yearParam) {
    return NextResponse.json({ error: 'grade, class_no, year 쿼리 파라미터가 필요합니다.' }, { status: 400 })
  }

  const grade = Number(gradeParam)
  const class_no = Number(classNoParam)
  const year = Number(yearParam)

  if (!Number.isFinite(grade) || !Number.isFinite(class_no) || !Number.isFinite(year)) {
    return NextResponse.json({ error: 'grade, class_no, year는 숫자여야 합니다.' }, { status: 400 })
  }

  const { data: students, error: studentsError } = await supabaseAdmin
    .from('students')
    .select('id, student_no, name')
    .eq('school_id', schoolId)
    .eq('year', year)
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

  // 학년도 조회 조건: 당해 3~12월 OR 익년 1~2월
  const { data: records, error: recordsError } = await supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('heart_rate_records' as any)
    .select('student_id, year, month, avg_bpm, max_bpm, min_bpm, record_count')
    .in('student_id', studentIds)
    .or(`and(year.eq.${year},month.gte.3),and(year.eq.${year + 1},month.lte.2)`)
    .returns<HeartRateMonthlyRow[]>()

  if (recordsError) {
    return NextResponse.json({ error: recordsError.message }, { status: 500 })
  }

  const studentIdToRow: Record<string, HeartRateRow> = {}
  for (const s of students ?? []) {
    studentIdToRow[s.id] = {
      student_id: s.id,
      student_no: s.student_no,
      name: s.name,
      avg_bpm: Array.from({ length: 12 }, () => null),
      max_bpm: Array.from({ length: 12 }, () => null),
      min_bpm: Array.from({ length: 12 }, () => null),
    }
  }

  for (const r of records ?? []) {
    const row = studentIdToRow[r.student_id]
    if (!row) continue
    const idx = Math.max(0, Math.min(11, (r.month ?? 1) - 1))

    row.avg_bpm[idx] = typeof r.avg_bpm === 'number' ? r.avg_bpm : null
    row.max_bpm[idx] = typeof r.max_bpm === 'number' ? r.max_bpm : null
    row.min_bpm[idx] = typeof r.min_bpm === 'number' ? r.min_bpm : null
  }

  const rows: HeartRateRow[] = Object.values(studentIdToRow).sort((a, b) => (a.student_no ?? 0) - (b.student_no ?? 0))
  return NextResponse.json({ rows })
}

export async function POST(request: NextRequest) {
  const auth = await getOperatorFromRequest(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { results, grade, class_no, year } = await request.json()
    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: '결과 데이터가 올바르지 않습니다.' }, { status: 400 })
    }

    const schoolId = auth.account.school_id as string

    // 1. student_id가 없는 데이터(신규 학생) 처리
    for (const r of results) {
      // UUID 형식이 아닌 경우(빈 문자열 등) 처리
      const isInvalidUuid = !r.student_id || r.student_id.trim() === ''

      if (isInvalidUuid) {
        // 학생 번호와 이름으로 기존 학생이 있는지 확인
        const { data: existingStudent, error: studentError } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('school_id', schoolId)
          .eq('year', year || r.year)
          .eq('grade', grade || r.grade)
          .eq('class_no', class_no || r.class_no)
          .eq('student_no', r.student_no)
          .maybeSingle()

        if (studentError) {
          console.error('학생 조회 오류:', studentError)
          continue
        }

        if (existingStudent) {
          r.student_id = existingStudent.id
        } else {
          // 학생이 없으면 새로 생성
          const { data: newStudent, error: createError } = await supabaseAdmin
            .from('students')
            .insert({
              school_id: schoolId,
              year: year || r.year,
              grade: grade || r.grade,
              class_no: class_no || r.class_no,
              student_no: r.student_no,
              name: r.name || `${r.student_no}번 학생`,
            })
            .select('id')
            .single()

          if (createError) {
            console.error('학생 생성 오류:', createError)
            continue
          }
          r.student_id = newStudent.id
        }
      }
    }

    // 학생 생성이 안 된 항목(여전히 student_id가 없는 항목) 필터링
    const validResults = results.filter(r => r.student_id && r.student_id.trim() !== '')

    if (validResults.length === 0) {
      return NextResponse.json({ error: '유효한 학생 데이터가 없습니다.' }, { status: 400 })
    }

    // 2. 기존 데이터 조회 테이터 추출
    const studentIds = Array.from(new Set(validResults.map(r => r.student_id)))
    const { data: existingRecords, error: fetchError } = await supabaseAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('heart_rate_records' as any)
      .select('student_id, year, month, avg_bpm, max_bpm, min_bpm, record_count')
      .in('student_id', studentIds)
      .returns<HeartRateMonthlyRow[]>()

    if (fetchError) {
      console.error('기존 심박수 조회 오류:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // 기존 데이터를 빠르게 찾기 위한 맵 생성
    const existingMap = new Map()
    existingRecords?.forEach(r => {
      const key = `${r.student_id}-${r.year}-${r.month}`
      existingMap.set(key, r)
    })

    // 3. 병합 로직 수행
    const upsertData = validResults.map(r => {
      const key = `${r.student_id}-${r.year}-${r.month}`
      const old = existingMap.get(key)

      if (old) {
        // 기존 기록이 있는 경우 병합
        const newCount = r.record_count
        const oldCount = old.record_count || 0
        const totalCount = oldCount + newCount

        // 1) 가중 평균 계산
        const oldAvg = old.avg_bpm || 0
        const newAvg = r.avg_bpm || 0
        const combinedAvg = Math.round((oldAvg * oldCount + newAvg * newCount) / totalCount * 10) / 10

        // 2) 최고/최저 갱신
        const combinedMax = Math.max(old.max_bpm || 0, r.max_bpm || 0)
        let combinedMin = old.min_bpm || 999
        if (r.min_bpm !== null && r.min_bpm < combinedMin) {
          combinedMin = r.min_bpm
        }

        return {
          student_id: r.student_id,
          year: r.year,
          month: r.month,
          avg_bpm: combinedAvg,
          max_bpm: combinedMax,
          min_bpm: combinedMin === 999 ? r.min_bpm : combinedMin,
          record_count: totalCount,
          updated_at: new Date().toISOString()
        }
      } else {
        // 기존 기록이 없는 경우 그대로 사용
        return {
          student_id: r.student_id,
          year: r.year,
          month: r.month,
          avg_bpm: r.avg_bpm,
          max_bpm: r.max_bpm,
          min_bpm: r.min_bpm,
          record_count: r.record_count,
          updated_at: new Date().toISOString()
        }
      }
    })

    const { error } = await supabaseAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('heart_rate_records' as any)
      .upsert(upsertData, {
        onConflict: 'student_id,year,month'
      })

    if (error) {
      console.error('심박수 저장 오류:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: results.length })
  } catch (err: unknown) {
    const e = err as Error
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
