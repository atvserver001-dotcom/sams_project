export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('op-access-token')?.value
  const jwtSecret = process.env.JWT_SECRET
  if (!token || !jwtSecret) return { error: 'Unauthorized', status: 401 as const }
  try {
    const decoded = jwt.verify(token, jwtSecret) as any
    if ((decoded as any).role !== 'admin') return { error: 'Forbidden', status: 403 as const }
    return { decoded }
  } catch (e) {
    return { error: 'Invalid token', status: 401 as const }
  }
}

function generateAuthKey() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from(randomBytes(12)).map(b => alphabet[b % alphabet.length]).join('')
}

// GET: 학교 목록 조회
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // 1. 학교 기본 정보 조회
  const { data: schoolsRaw, error: schoolErr } = await (supabaseAdmin as any)
    .from('schools')
    .select('id, group_no, name, school_type, recognition_key, created_at')
    .order('created_at', { ascending: true })

  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })

  const schools = (schoolsRaw ?? []) as any[]
  const schoolIds = schools.map((s) => s.id as string)
  
  // 2. 각 학교별 할당된 컨텐츠 및 디바이스 집계
  const { data: schoolContentsRaw, error: scErr } = await (supabaseAdmin as any)
    .from('school_contents')
    .select(`
      id,
      school_id,
      content_id,
      start_date,
      end_date,
      is_unlimited,
      content:content_id(name, color_hex),
      school_devices(
        id,
        device_id,
        created_at,
        auth_key,
        memo,
        device:device_id(device_name)
      )
    `)
    .in('school_id', schoolIds)

  if (scErr) return NextResponse.json({ error: scErr.message }, { status: 500 })
  const schoolContents = (schoolContentsRaw ?? []) as any[]

  const items = schools.map((school: any) => {
    const contents = (schoolContents || [])
      .filter((sc: any) => sc.school_id === school.id)
      .map((sc: any) => ({
        id: sc.id,
        content_id: sc.content_id,
        name: (sc.content as any)?.name || '-',
        color_hex: (sc.content as any)?.color_hex || null,
        start_date: sc.start_date ?? null,
        end_date: sc.end_date ?? null,
        is_unlimited: !!sc.is_unlimited,
        period: sc.is_unlimited ? '제한없음' : `${sc.start_date || ''} ~ ${sc.end_date || ''}`,
        devices: (sc.school_devices || []).map((sd: any) => ({
          id: sd.id,
          device_id: sd.device_id,
          device_name: sd.device?.device_name || '-',
          auth_key: sd.auth_key,
          created_at: sd.created_at,
          memo: sd.memo ?? '',
        }))
      }))

    return {
      ...(school as any),
      contents
    }
  })

  return NextResponse.json({ items, total: schools.length }, { status: 200 })
}

// POST: 학교 생성
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { group_no, name, school_type, content_assignments } = body as {
    group_no: string; 
    name: string; 
    school_type: number; 
    content_assignments?: Array<{
      content_id: string;
      start_date?: string | null;
      end_date?: string | null;
      is_unlimited: boolean;
      device_quantities: Array<{ device_id: string; quantity: number }>;
    }>
  }

  if (!group_no || !name) {
    return NextResponse.json({ error: 'group_no, name는 필수입니다.' }, { status: 400 })
  }

  // 중복 체크
  const { data: dup } = await (supabaseAdmin as any).from('schools').select('id').eq('group_no', group_no).maybeSingle()
  if (dup) return NextResponse.json({ error: '이미 존재하는 그룹번호입니다.' }, { status: 409 })

  // 인식키 생성
  const recognition_key = Array.from(randomBytes(5)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

  // 1. 학교 생성
  const { data: schoolData, error: schoolErr } = await ((supabaseAdmin as any)
    .from('schools') as any)
    .insert({ group_no, name, school_type, recognition_key })
    .select()
    .single()

  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  const school = schoolData as any

  // 2. 컨텐츠 및 디바이스 할당
  if (content_assignments && content_assignments.length > 0) {
    for (const assignment of content_assignments) {
      // 2.1. school_contents 삽입
      const { data: scData, error: scErr } = await ((supabaseAdmin as any)
        .from('school_contents') as any)
        .insert({
          school_id: school.id,
          content_id: assignment.content_id,
          start_date: assignment.is_unlimited ? null : (assignment.start_date || null),
          end_date: assignment.is_unlimited ? null : (assignment.end_date || null),
          is_unlimited: assignment.is_unlimited
        })
        .select()
        .single()

      if (scErr) {
        return NextResponse.json({ error: '컨텐츠 할당 중 오류: ' + scErr.message }, { status: 500 })
      }
      const sc = scData as any

      // 2.2. school_devices 삽입 (수량만큼 인증키 생성)
      const deviceRows: any[] = []
      if (assignment.device_quantities && Array.isArray(assignment.device_quantities)) {
        for (const dq of assignment.device_quantities) {
          const qty = Number(dq.quantity)
          for (let i = 0; i < qty; i++) {
            deviceRows.push({
              school_content_id: sc.id,
              device_id: dq.device_id,
              auth_key: generateAuthKey()
            })
          }
        }
      }

      if (deviceRows.length > 0) {
        const { error: devErr } = await (supabaseAdmin as any).from('school_devices').insert(deviceRows)
        if (devErr) {
          return NextResponse.json({ error: '디바이스 할당 중 오류: ' + devErr.message }, { status: 500 })
        }
      }
    }
  }

  return NextResponse.json({ success: true, item: school }, { status: 201 })
}
