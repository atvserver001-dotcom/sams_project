export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

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

// GET: 학교 상세 + 디바이스 매핑 목록
export async function GET(req: NextRequest, { params }: { params: Promise<{ group_no: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { group_no: groupNo } = await params
  const { data: school, error: findErr } = await supabaseAdmin
    .from('schools')
    .select('id, group_no, name, school_type')
    .eq('group_no', groupNo)
    .single()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })

  const schoolId = (school as any)?.id as string
  const { data: mgmt, error: mgmtErr } = await supabaseAdmin
    .from('device_management')
    .select('device_id, start_date, end_date, limited_period, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true })
  if (mgmtErr) return NextResponse.json({ error: mgmtErr.message }, { status: 500 })

  const deviceIds = Array.from(new Set((mgmt ?? []).map((m: any) => m.device_id)))
  let idToName = new Map<string, string>()
  if (deviceIds.length) {
    const { data: devices, error: devErr } = await supabaseAdmin
      .from('devices')
      .select('id, device_name')
      .in('id', deviceIds)
    if (devErr) return NextResponse.json({ error: devErr.message }, { status: 500 })
    for (const r of (devices ?? []) as Array<{ id: string; device_name: string }>) {
      idToName.set(r.id, r.device_name)
    }
  }

  let devices = (mgmt ?? []).map((m: any) => ({
    device_id: m.device_id as string,
    device_name: idToName.get(m.device_id as string) || '-',
    start_date: m.start_date as string | null,
    end_date: m.end_date as string | null,
    limited_period: !!m.limited_period,
  }))

  // [폴백] device_management가 비어있고, 레거시 device_ids가 있는 환경만 안전 체크 후 표시
  try {
    if ((!devices || devices.length === 0) && 'device_ids' in (school as any) && Array.isArray((school as any).device_ids) && (school as any).device_ids.length) {
      const legacyIds = (school as any).device_ids as string[]
      const { data: legacyDevs } = await supabaseAdmin
        .from('devices')
        .select('id, device_name')
        .in('id', legacyIds)
      const idName = new Map<string, string>()
      for (const r of (legacyDevs ?? []) as Array<{ id: string; device_name: string }>) idName.set(r.id, r.device_name)
      devices = legacyIds.map((did) => ({
        device_id: did,
        device_name: idName.get(did) || '-',
        start_date: null,
        end_date: null,
        limited_period: false,
      }))
    }
  } catch {}

  return NextResponse.json({
    group_no: (school as any)?.group_no,
    name: (school as any)?.name,
    school_type: (school as any)?.school_type,
    devices,
  }, { status: 200 })
}

// PUT: 수정
export async function PUT(req: NextRequest, { params }: { params: Promise<{ group_no: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { group_no: groupNo } = await params
  const body = await req.json()
  const { group_no: newGroupNo, name, school_type, /* recognition_key ignored */ device_ids, device_assignments } = body as {
    group_no?: string; name?: string; school_type?: string; recognition_key?: string; device_ids?: string[]; device_assignments?: Array<{ device_id: string; start_date?: string | null; end_date?: string | null; limited_period?: boolean }>
  }

  const updatePayload: Database['public']['Tables']['schools']['Update'] = {} as any
  // 그룹번호 변경 처리
  if (newGroupNo !== undefined) {
    if (!/^\d{4}$/.test(newGroupNo)) {
      return NextResponse.json({ error: '그룹번호는 4자리 숫자여야 합니다.' }, { status: 400 })
    }
    if (newGroupNo !== groupNo) {
      const { data: dup, error: dupErr } = await supabaseAdmin
        .from('schools')
        .select('group_no')
        .eq('group_no', newGroupNo)
        .maybeSingle()
      if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 500 })
      if (dup) return NextResponse.json({ error: '이미 존재하는 그룹번호입니다.' }, { status: 409 })
      updatePayload.group_no = newGroupNo as any
    }
  }
  if (name !== undefined) updatePayload.name = name
  if (school_type !== undefined) {
    const allowedCodes = [1,2,3] as const
    if (!allowedCodes.includes(school_type as any)) {
      return NextResponse.json({ error: 'school_type은 1(초) / 2(중) / 3(고) 이어야 합니다.' }, { status: 400 })
    }
    ;(updatePayload as any).school_type = school_type as any
  }
  // recognition_key is immutable after creation

  const { data: school, error: findErr } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('group_no', groupNo)
    .single()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })

  const schoolId = (school as any)?.id as string

  const { error } = await (supabaseAdmin
    .from('schools') as any)
    .update(updatePayload as any)
    .eq('id', schoolId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 디바이스 재설정 (옵션): 전달 시 전체 교체
  if (Array.isArray(device_ids) || Array.isArray(device_assignments)) {
    const { error: delErr } = await supabaseAdmin
      .from('device_management')
      .delete()
      .eq('school_id', schoolId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    const rows = (Array.isArray(device_assignments) && device_assignments.length
      ? device_assignments.map((a) => ({
          school_id: schoolId,
          device_id: a.device_id,
          start_date: a.start_date ?? null,
          end_date: a.end_date ?? null,
          limited_period: !!a.limited_period,
        }))
      : (Array.isArray(device_ids) ? device_ids.map((id: string) => ({ school_id: schoolId, device_id: id })) : []))
    // 기간 검증
    for (const r of rows as any[]) {
      if (r.limited_period && r.start_date && r.end_date) {
        if (r.start_date > r.end_date) {
          return NextResponse.json({ error: '기간 오류: 시작일은 종료일보다 이후일 수 없습니다.' }, { status: 400 })
        }
      }
    }
    if (rows.length) {
      const { error: insErr } = await (supabaseAdmin
        .from('device_management') as any)
        .insert(rows as any)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }
  return NextResponse.json({ success: true }, { status: 200 })
}

// DELETE: 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ group_no: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { group_no: groupNo } = await params
  const { data: school, error: findErr } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('group_no', groupNo)
    .single()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })

  const schoolId = (school as any)?.id as string

  // device_management는 schools.id에 FK가 걸려 있고 on delete cascade라면 별도 삭제 불필요
  const { error } = await supabaseAdmin
    .from('schools')
    .delete()
    .eq('id', schoolId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true }, { status: 200 })
}


