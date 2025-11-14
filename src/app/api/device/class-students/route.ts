export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

type Gender = 'M' | 'F'

type RequestBody = {
  recognition_key: string
  year: number
  grade: number
  class_no: number
}

type StudentRow = {
  id: string
  student_no: number
  name: string
  gender: Gender | null
  height_cm: number | null
  weight_kg: number | null
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type: application/json 필요' }, { status: 415 })
  }

  let body: Partial<RequestBody>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 본문' }, { status: 400 })
  }

  // 키 이름 유연 처리: recognition_key | recognitionKey | RecognitionKey, 등
  const recognition_key =
    (body as any)?.recognition_key ??
    (body as any)?.recognitionKey ??
    (body as any)?.RecognitionKey
  const year =
    (body as any)?.year ??
    (body as any)?.Year
  const grade =
    (body as any)?.grade ??
    (body as any)?.Grade
  const class_no =
    (body as any)?.class_no ??
    (body as any)?.classNo ??
    (body as any)?.ClassNo

  if (!recognition_key) return NextResponse.json({ error: 'recognition_key 필수' }, { status: 400 })
  if (!Number.isFinite(Number(year))) return NextResponse.json({ error: 'year 숫자여야 합니다.' }, { status: 400 })
  if (!Number.isFinite(Number(grade))) return NextResponse.json({ error: 'grade 숫자여야 합니다.' }, { status: 400 })
  if (!Number.isFinite(Number(class_no))) return NextResponse.json({ error: 'class_no 숫자여야 합니다.' }, { status: 400 })

  // 1) 학교 조회
  const { data: school, error: schoolErr } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('recognition_key', recognition_key)
    .maybeSingle<{ id: string }>()

  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: '학교를 찾을 수 없습니다.' }, { status: 404 })

  // 2) 학생 목록 조회
  const { data: students, error: studentsErr } = await supabaseAdmin
    .from('students')
    .select('id, student_no, name, gender, height_cm, weight_kg')
    .eq('school_id', school.id)
    .eq('year', Number(year))
    .eq('grade', Number(grade))
    .eq('class_no', Number(class_no))
    .order('student_no', { ascending: true })
    .returns<StudentRow[]>()

  if (studentsErr) return NextResponse.json({ error: studentsErr.message }, { status: 500 })

  return NextResponse.json({
    rows: (students ?? []).map(s => ({
      student_no: s.student_no ?? null,
      name: s.name ?? '',
      gender: s.gender ?? null,
      height_cm: s.height_cm ?? null,
      weight_kg: s.weight_kg ?? null,
    })),
  })
}


