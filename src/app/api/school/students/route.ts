export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

async function getOperatorFromRequest(request: NextRequest) {
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
      .single<Database['public']['Tables']['operator_accounts']['Row']>()

    if (error || !account) {
      return { error: '사용자를 찾을 수 없습니다.', status: 404 as const }
    }

    if (!account.is_active) {
      return { error: '비활성화된 계정입니다.', status: 403 as const }
    }

    // 관리자 acting 허용
    if ((account as any).role === 'admin') {
      const actingSchoolId = request.cookies.get('acting_school_id')?.value || null
      if (!actingSchoolId) return { error: '관리자 acting 컨텍스트가 설정되지 않았습니다.', status: 403 as const }
      return { account: { ...account, school_id: actingSchoolId } as any }
    }

    if ((account as any).role === 'school') {
      if (!account.school_id) return { error: '학교 정보가 누락되었습니다.', status: 400 as const }
      return { account }
    }

    return { error: '권한이 없습니다.', status: 403 as const }
  } catch {
    return { error: '유효하지 않은 세션입니다.', status: 401 as const }
  }
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

  if (!gradeParam || !classNoParam) {
    return NextResponse.json({ error: 'grade, class_no 쿼리 파라미터가 필요합니다.' }, { status: 400 })
  }

  const grade = Number(gradeParam)
  const class_no = Number(classNoParam)

  if (!Number.isFinite(grade) || !Number.isFinite(class_no)) {
    return NextResponse.json({ error: 'grade, class_no는 숫자여야 합니다.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('students')
    .select('*')
    .eq('school_id', schoolId)
    .eq('grade', grade)
    .eq('class_no', class_no)
    .order('student_no', { ascending: true })
    .returns<Database['public']['Tables']['students']['Row'][]>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ students: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await getOperatorFromRequest(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const schoolId = auth.account.school_id as string

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: '유효하지 않은 JSON 본문' }, { status: 400 })
  }

  const {
    grade,
    class_no,
    student_no,
    name,
    gender,
    birth_date,
    email,
    height_cm,
    weight_kg,
    notes,
  } = body as Partial<Database['public']['Tables']['students']['Insert']>

  if (!grade || !class_no || !student_no || !name) {
    return NextResponse.json({ error: 'grade, class_no, student_no, name은 필수입니다.' }, { status: 400 })
  }

  const insertPayload: Database['public']['Tables']['students']['Insert'] = {
    school_id: schoolId,
    grade,
    class_no,
    student_no,
    name,
    gender: (gender as any) ?? null,
    birth_date: birth_date ?? null,
    email: email ?? null,
    height_cm: height_cm ?? null,
    weight_kg: weight_kg ?? null,
    notes: notes ?? null,
    updated_at: new Date().toISOString(),
  } as any

  const { data, error } = await (supabaseAdmin
    .from('students') as any)
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ student: data }, { status: 201 })
}


