export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

type ExerciseType = 'endurance' | 'flexibility' | 'strength'

type IngestItem = {
  idempotency_key: string
  recognition_key: string
  year: number
  grade: number
  class_no: number
  student_no: number
  exercise_type: ExerciseType
  month: number
  avg_duration_seconds?: number | null
  avg_accuracy?: number | null
  avg_bpm?: number | null
  avg_max_bpm?: number | null
  avg_calories?: number | null
}

function isValidExerciseType(v: any): v is ExerciseType {
  return v === 'endurance' || v === 'flexibility' || v === 'strength'
}

function validateItem(it: any): { ok: true; item: IngestItem } | { ok: false; message: string } {
  const requiredFields = [
    'idempotency_key',
    'recognition_key',
    'year',
    'grade',
    'class_no',
    'student_no',
    'exercise_type',
    'month',
  ] as const

  for (const f of requiredFields) {
    if (it == null || it[f] == null || it[f] === '') {
      return { ok: false, message: `필수 필드 누락: ${f}` }
    }
  }

  if (!Number.isFinite(Number(it.year))) return { ok: false, message: 'year 숫자여야 합니다.' }
  if (!Number.isFinite(Number(it.grade))) return { ok: false, message: 'grade 숫자여야 합니다.' }
  if (!Number.isFinite(Number(it.class_no))) return { ok: false, message: 'class_no 숫자여야 합니다.' }
  if (!Number.isFinite(Number(it.student_no))) return { ok: false, message: 'student_no 숫자여야 합니다.' }
  if (!Number.isFinite(Number(it.month)) || it.month < 1 || it.month > 12) return { ok: false, message: 'month(1-12) 범위를 벗어났습니다.' }
  if (!isValidExerciseType(it.exercise_type)) return { ok: false, message: 'exercise_type 값이 유효하지 않습니다.' }

  const item: IngestItem = {
    idempotency_key: String(it.idempotency_key),
    recognition_key: String(it.recognition_key),
    year: Number(it.year),
    grade: Number(it.grade),
    class_no: Number(it.class_no),
    student_no: Number(it.student_no),
    exercise_type: it.exercise_type,
    month: Number(it.month),
    avg_duration_seconds: it.avg_duration_seconds == null ? null : Number(it.avg_duration_seconds),
    avg_accuracy: it.avg_accuracy == null ? null : Number(it.avg_accuracy),
    avg_bpm: it.avg_bpm == null ? null : Number(it.avg_bpm),
    avg_max_bpm: it.avg_max_bpm == null ? null : Number(it.avg_max_bpm),
    avg_calories: it.avg_calories == null ? null : Number(it.avg_calories),
  }

  return { ok: true, item }
}

export async function POST(request: NextRequest) {
  // 디바이스 토큰 검증 제거: 누구나 호출 가능

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type: application/json 필요' }, { status: 415 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 본문' }, { status: 400 })
  }

  // 배치: body가 배열이거나 { items: [...] }
  const items: any[] | null = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null
  if (items && items.length > 0) {
    const validated: IngestItem[] = []
    for (const it of items) {
      const v = validateItem(it)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 })
      validated.push(v.item)
    }

    const { data, error } = await (supabaseAdmin as any).rpc('upsert_exercise_records_batch', {
      p_items: validated,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ upserted: data ?? 0 })
  }

  // 단건
  const v = validateItem(body)
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 })
  const it = v.item

  const { data, error } = await (supabaseAdmin as any).rpc('upsert_exercise_record_by_key_idem', {
    p_idempotency_key: it.idempotency_key,
    p_recognition_key: it.recognition_key,
    p_year: it.year,
    p_grade: it.grade,
    p_class_no: it.class_no,
    p_student_no: it.student_no,
    p_exercise_type: it.exercise_type,
    p_month: it.month,
    p_avg_duration_seconds: it.avg_duration_seconds,
    p_avg_accuracy: it.avg_accuracy,
    p_avg_bpm: it.avg_bpm,
    p_avg_max_bpm: it.avg_max_bpm,
    p_avg_calories: it.avg_calories,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ upserted: Boolean(data) })
}


