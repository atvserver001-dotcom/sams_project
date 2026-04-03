export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/** 디바이스에서 PAPS 월별 행의 일부 항목만 갱신할 때 사용하는 타입 */
const RECORD_TYPES = [
  'muscular_endurance', // 근지구력
  'power', // 순발력 (power_1, power_2)
  'flexibility', // 유연성 (flexibility_1, flexibility_2)
  'cardio', // 심폐지구력 (cardio_1min, cardio_2min, cardio_3min)
  'bmi', // 체질량지수
] as const

type RecordType = (typeof RECORD_TYPES)[number]

function isRecordType(v: unknown): v is RecordType {
  return typeof v === 'string' && (RECORD_TYPES as readonly string[]).includes(v)
}

type Body = {
  recognition_key: string
  /** 측정일 기준 달력 연도 (ingest API의 year와 동일: 1·2월이면 학생 학년도는 year-1) */
  year: number
  month: number
  grade: number
  class_no: number
  student_no: number
  /** 갱신할 PAPS 항목 구분 */
  record_type: RecordType
  muscular_endurance?: number | null
  power_1?: number | null
  power_2?: number | null
  flexibility_1?: number | null
  flexibility_2?: number | null
  cardio_1min?: number | null
  cardio_2min?: number | null
  cardio_3min?: number | null
  bmi?: number | null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function intRow(v: number): number {
  return Math.trunc(v)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isDuplicateStudentError(err: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any)?.code || ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = String((err as any)?.message || '')
  return code === '23505' || message.includes('duplicate key value violates unique constraint')
}

/** device/ingest 와 동일: 없으면 insert, 유니크 충돌 시 재조회. insert 시 Returning 으로 id 를 바로 받아 분리 조회 실패를 줄임 */
async function ensureStudentExists(params: {
  recognition_key: string
  calendarYear: number
  month: number
  grade: number
  class_no: number
  student_no: number
}) {
  const { recognition_key, calendarYear, month, grade, class_no, student_no } = params

  const yi = intRow(calendarYear)
  const mi = intRow(month)
  const gi = intRow(grade)
  const ci = intRow(class_no)
  const sni = intRow(student_no)

  const { data: school, error: schoolError } = await (supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('schools') as any)
    .select('id')
    .eq('recognition_key', recognition_key)
    .maybeSingle()

  if (schoolError || !school) {
    return { ok: false as const, message: '유효하지 않은 recognition_key 입니다.' }
  }

  // 학년도 계산: 1, 2월 데이터는 전년도 학년도 학생에게 귀속 (ingest 와 동일)
  const studentYear = mi === 1 || mi === 2 ? yi - 1 : yi

  const selectStudentId = async (): Promise<
    | { ok: true; student_id: string | null }
    | { ok: false; message: string }
  > => {
    const { data, error } = await (supabaseAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('students') as any)
      .select('id')
      .eq('school_id', school.id)
      .eq('year', studentYear)
      .eq('grade', gi)
      .eq('class_no', ci)
      .eq('student_no', sni)
      .maybeSingle()
    if (error) {
      return { ok: false, message: error.message || '학생 조회 중 오류가 발생했습니다.' }
    }
    return { ok: true, student_id: (data?.id as string | undefined) ?? null }
  }

  const selectStudentIdWithRetry = async (): Promise<
    | { ok: true; student_id: string }
    | { ok: false; message: string }
  > => {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(40 * attempt)
      const r = await selectStudentId()
      if (!r.ok) return { ok: false, message: r.message }
      if (r.student_id) return { ok: true, student_id: r.student_id }
    }
    return { ok: false, message: '학생 생성 후 조회에 실패했습니다.' }
  }

  const first = await selectStudentId()
  if (!first.ok) return { ok: false as const, message: first.message }
  if (first.student_id) {
    return { ok: true as const, student_id: first.student_id, school_id: school.id as string }
  }

  const payload = {
    school_id: school.id,
    year: studentYear,
    grade: gi,
    class_no: ci,
    student_no: sni,
    name: `${sni}번 학생`,
  }

  const { error: insertError } = await (supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('students') as any)
    .insert(payload)

  if (insertError) {
    if (!isDuplicateStudentError(insertError)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = String((insertError as any).message || '')
      return { ok: false as const, message: message || '학생 정보 저장 중 오류가 발생했습니다.' }
    }
    // 중복 키 오류는 이미 학생이 존재하므로 OK — 아래에서 조회
  }

  // insert 성공 또는 중복 — 별도 조회로 student_id 확보 (ingest 와 동일 패턴)
  const after = await selectStudentIdWithRetry()
  if (!after.ok) return { ok: false as const, message: after.message }
  return { ok: true as const, student_id: after.student_id, school_id: school.id as string }
}

function validatePayloadForType(
  recordType: RecordType,
  body: Body
): { ok: true } | { ok: false; message: string } {
  switch (recordType) {
    case 'muscular_endurance': {
      if (num(body.muscular_endurance) == null) {
        return { ok: false, message: 'record_type이 muscular_endurance일 때 muscular_endurance 값이 필요합니다.' }
      }
      return { ok: true }
    }
    case 'power': {
      if (num(body.power_1) == null && num(body.power_2) == null) {
        return { ok: false, message: 'record_type이 power일 때 power_1 또는 power_2 중 하나 이상 필요합니다.' }
      }
      return { ok: true }
    }
    case 'flexibility': {
      if (num(body.flexibility_1) == null && num(body.flexibility_2) == null) {
        return { ok: false, message: 'record_type이 flexibility일 때 flexibility_1 또는 flexibility_2 중 하나 이상 필요합니다.' }
      }
      return { ok: true }
    }
    case 'cardio': {
      if (
        num(body.cardio_1min) == null &&
        num(body.cardio_2min) == null &&
        num(body.cardio_3min) == null
      ) {
        return { ok: false, message: 'record_type이 cardio일 때 cardio_1min, cardio_2min, cardio_3min 중 하나 이상 필요합니다.' }
      }
      return { ok: true }
    }
    case 'bmi': {
      if (num(body.bmi) == null) {
        return { ok: false, message: 'record_type이 bmi일 때 bmi 값이 필요합니다.' }
      }
      return { ok: true }
    }
    default: {
      const _exhaustive: never = recordType
      return { ok: false, message: `알 수 없는 record_type: ${_exhaustive}` }
    }
  }
}

function applyTypeToRow(recordType: RecordType, body: Body, row: Record<string, unknown>) {
  switch (recordType) {
    case 'muscular_endurance': {
      const v = num(body.muscular_endurance)
      if (v != null) row.muscular_endurance = v
      break
    }
    case 'power': {
      const p1 = num(body.power_1)
      const p2 = num(body.power_2)
      if (p1 != null) row.power_1 = p1
      if (p2 != null) row.power_2 = p2
      break
    }
    case 'flexibility': {
      const f1 = num(body.flexibility_1)
      const f2 = num(body.flexibility_2)
      if (f1 != null) row.flexibility_1 = f1
      if (f2 != null) row.flexibility_2 = f2
      break
    }
    case 'cardio': {
      const c1 = num(body.cardio_1min)
      const c2 = num(body.cardio_2min)
      const c3 = num(body.cardio_3min)
      if (c1 != null) row.cardio_1min = c1
      if (c2 != null) row.cardio_2min = c2
      if (c3 != null) row.cardio_3min = c3
      break
    }
    case 'bmi': {
      const b = num(body.bmi)
      if (b != null) row.bmi = b
      break
    }
    default: {
      const _exhaustive: never = recordType
      void _exhaustive
    }
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type: application/json 필요' }, { status: 415 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 본문' }, { status: 400 })
  }

  if (!body.recognition_key || body.recognition_key === '') {
    return NextResponse.json({ error: 'recognition_key가 필요합니다.' }, { status: 400 })
  }

  if (!isRecordType(body.record_type)) {
    return NextResponse.json(
      {
        error: `record_type은 다음 중 하나여야 합니다: ${RECORD_TYPES.join(', ')}`,
      },
      { status: 400 }
    )
  }

  const recordType = body.record_type

  const calendarYear = num(body.year)
  const month = num(body.month)
  const grade = num(body.grade)
  const class_no = num(body.class_no)
  const student_no = num(body.student_no)

  if (calendarYear == null || !Number.isInteger(calendarYear)) {
    return NextResponse.json({ error: 'year는 정수여야 합니다.' }, { status: 400 })
  }
  if (month == null || month < 1 || month > 12 || !Number.isInteger(month)) {
    return NextResponse.json({ error: 'month는 1~12 정수여야 합니다.' }, { status: 400 })
  }
  if (grade == null || class_no == null || student_no == null) {
    return NextResponse.json({ error: 'grade, class_no, student_no가 필요합니다.' }, { status: 400 })
  }

  const payloadCheck = validatePayloadForType(recordType, body)
  if (!payloadCheck.ok) {
    return NextResponse.json({ error: payloadCheck.message }, { status: 400 })
  }

  const ensured = await ensureStudentExists({
    recognition_key: String(body.recognition_key),
    calendarYear,
    month,
    grade,
    class_no,
    student_no,
  })
  if (!ensured.ok) {
    return NextResponse.json({ error: ensured.message }, { status: 400 })
  }

  const { student_id } = ensured

  const { data: existing, error: selErr } = await (supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('paps_records' as any)
    .select(
      'student_id,year,month,muscular_endurance,power_1,power_2,flexibility_1,flexibility_2,cardio_1min,cardio_2min,cardio_3min,bmi'
    )
    .eq('student_id', student_id)
    .eq('year', calendarYear)
    .eq('month', month)
    .maybeSingle())

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  const row: Record<string, unknown> = existing
    ? { ...(existing as unknown as Record<string, unknown>) }
    : {
        student_id,
        year: calendarYear,
        month,
        muscular_endurance: null,
        power_1: null,
        power_2: null,
        flexibility_1: null,
        flexibility_2: null,
        cardio_1min: null,
        cardio_2min: null,
        cardio_3min: null,
        bmi: null,
      }

  applyTypeToRow(recordType, body, row)

  const { error: upErr } = await (supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('paps_records' as any)
    .upsert(row, { onConflict: 'student_id,year,month' }))

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, record_type: recordType })
}
