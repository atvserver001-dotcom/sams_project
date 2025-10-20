export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
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

// GET: 목록 조회 (페이징 제거, 디바이스 전체 목록 집계)
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error, count } = await supabaseAdmin
    .from('schools')
    .select('id, group_no, name, school_type, recognition_key, created_at', { count: 'exact' })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 디바이스 이름 및 기간 집계 (device_management + devices 조합, 대표 1개)
  type SchoolListRow = { id: string; group_no: string; name: string; school_type: string; recognition_key: string; device_ids?: string[] | null; created_at: string }
  const schoolRows = (data ?? []) as SchoolListRow[]
  const schoolIds = schoolRows.map(s => s.id)
  // 학교별로 모든 디바이스 이름과 각각의 기간을 수집
  const deviceMap = new Map<string, Array<{ device_name: string; period: string }>>() // key: school_id
  if (schoolIds.length > 0) {
    const { data: mgmt } = await supabaseAdmin
      .from('device_management')
      .select('school_id, device_id, start_date, end_date, limited_period, created_at')
      .in('school_id', schoolIds)
      .order('created_at', { ascending: true })

    if (mgmt && mgmt.length) {
      const mgmtRows = (mgmt ?? []) as Array<{ school_id: string; device_id: string; start_date: string | null; end_date: string | null; limited_period: boolean; created_at: string }>
      const deviceIds = Array.from(new Set(mgmtRows.map((m) => m.device_id)))
      const { data: deviceRows } = await supabaseAdmin
        .from('devices')
        .select('id, device_name')
        .in('id', deviceIds)

      const idToName = new Map<string, string>()
      if (deviceRows) {
        const deviceRowsList = deviceRows as Array<{ id: string; device_name: string }>
        for (const r of deviceRowsList) idToName.set(r.id as string, r.device_name as string)
      }

      for (const m of mgmtRows) {
        const list = deviceMap.get(m.school_id) || []
        const deviceName = idToName.get(m.device_id) || '-'
        const period = m.limited_period && m.start_date && m.end_date
          ? `${m.start_date} ~ ${m.end_date}`
          : '제한없음'
        // 동일 디바이스 이름 중복 방지 (같은 학교 내 동일 디바이스가 여러 레코드일 때)
        if (!list.some((x) => x.device_name === deviceName && x.period === period)) {
          list.push({ device_name: deviceName, period })
        }
        deviceMap.set(m.school_id, list)
      }
    }
  }

  // [폴백] 레거시 schools.device_ids 사용 (device_management가 비어있는 경우)
  // device_ids 컬럼이 없는 배포 환경을 고려하여 안전 체크 후 폴백 적용
  try {
    const hasDeviceIds = Array.isArray((schoolRows[0] as any)?.device_ids) || (schoolRows as any[]).some(r => 'device_ids' in r)
    if (hasDeviceIds) {
      const legacyIdSet = new Set<string>()
      const schoolNeedingFallback: string[] = [] // school_id 목록
      for (const s of schoolRows) {
        const hasMgmt = deviceMap.has(s.id)
        const legacy = (s as any).device_ids as string[] | null | undefined
        if (!hasMgmt && legacy && legacy.length) {
          schoolNeedingFallback.push(s.id)
          for (const did of legacy) legacyIdSet.add(did)
        }
      }
      if (legacyIdSet.size > 0) {
        const allLegacyIds = Array.from(legacyIdSet)
        const { data: legacyDevices } = await supabaseAdmin
          .from('devices')
          .select('id, device_name')
          .in('id', allLegacyIds)
        if (legacyDevices) {
          const idToName = new Map<string, string>()
          for (const r of legacyDevices as Array<{ id: string; device_name: string }>) {
            idToName.set(r.id, r.device_name)
          }
          for (const s of schoolRows) {
            if (!schoolNeedingFallback.includes(s.id)) continue
            const legacy = ((s as any).device_ids as string[]) || []
            const list: Array<{ device_name: string; period: string }> = []
            for (const did of legacy) {
              const name = idToName.get(did) || '-'
              if (!list.some(x => x.device_name === name)) {
                list.push({ device_name: name, period: '제한없음' })
              }
            }
            if (list.length) deviceMap.set(s.id, list)
          }
        }
      }
    }
  } catch {}

  const items = schoolRows.map((s) => {
    const devices = deviceMap.get(s.id) || []
    return {
      id: s.id,
      group_no: s.group_no,
      name: s.name,
      school_type: (s as any).school_type,
      recognition_key: (s as any).recognition_key,
      devices,
    }
  })

  return NextResponse.json({ items, total: count ?? 0 }, { status: 200 })
}

// POST: 생성
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { group_no, name, school_type, device_ids, device_assignments } = body as {
    group_no?: string; name?: string; school_type?: string; device_ids?: string[]; device_assignments?: Array<{ device_id: string; start_date?: string | null; end_date?: string | null; limited_period?: boolean }>
  }

  if (!group_no || !name) {
    return NextResponse.json({ error: 'group_no, name는 필수입니다.' }, { status: 400 })
  }
  if (!/^\d{4}$/.test(group_no)) {
    return NextResponse.json({ error: '그룹번호는 4자리 숫자여야 합니다.' }, { status: 400 })
  }

  const allowedCodes = [1,2,3] as const
  const finalSchoolType = (school_type ?? 1) as number
  if (!allowedCodes.includes(finalSchoolType as any)) {
    return NextResponse.json({ error: 'school_type은 1(초) / 2(중) / 3(고) 이어야 합니다.' }, { status: 400 })
  }

  // 그룹번호 중복 체크
  const { data: dup, error: dupErr } = await supabaseAdmin
    .from('schools')
    .select('group_no')
    .eq('group_no', group_no)
    .maybeSingle()
  if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 500 })
  if (dup) return NextResponse.json({ error: '이미 존재하는 그룹번호입니다.' }, { status: 409 })

  // 인식키 10자리 소문자+숫자 생성
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const generateKey = (len = 10) => Array.from(randomBytes(len)).map(b => alphabet[b % alphabet.length]).join('')
  const recognition_key = generateKey(10)

  const { data: inserted, error } = await (supabaseAdmin
    .from('schools') as any)
    .insert({ group_no, name, school_type: finalSchoolType, recognition_key } as any)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 선택된 디바이스를 device_management에 반영 (기간/제한 포함)
  const schoolId = (inserted as any)?.id as string
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
    const { error: mgmtErr } = await (supabaseAdmin
      .from('device_management') as any)
      .insert(rows as any)
    if (mgmtErr) return NextResponse.json({ error: mgmtErr.message }, { status: 500 })
  }
  return NextResponse.json({ success: true }, { status: 201 })
}


