export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
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

// GET: 학교 세부정보 목록 (페이징)
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const search = req.nextUrl.searchParams
  const page = Math.max(1, Number(search.get('page') || '1'))
  const pageSize = Math.max(1, Number(search.get('pageSize') || '10'))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // 1) 기본 학교 목록 페이징 조회 (schools)
  const { data: schools, error: schoolsErr, count } = await supabaseAdmin
    .from('schools')
    .select('id, group_no, name', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(from, to)

  if (schoolsErr) return NextResponse.json({ error: schoolsErr.message }, { status: 500 })

  const schoolIds = (schools ?? []).map((s: any) => s.id as string)

  // 2) 교사 계정 수 집계
  let teacherCountBySchoolId = new Map<string, number>()
  if (schoolIds.length) {
    const { data: accounts, error: accErr } = await supabaseAdmin
      .from('operator_accounts')
      .select('school_id, role')
      .in('school_id', schoolIds)
      .eq('role', 'school')

    if (!accErr) {
      for (const r of accounts) {
        if (r.school_id) {
          teacherCountBySchoolId.set(r.school_id, (teacherCountBySchoolId.get(r.school_id) || 0) + 1)
        }
      }
    }
  }

  // 3) 제품 구성(디바이스) 수 집계: school_contents -> school_devices
  let deviceCountBySchoolId = new Map<string, number>()
  if (schoolIds.length) {
    const { data: schoolContents, error: scErr } = await supabaseAdmin
      .from('school_contents')
      .select('id, school_id')
      .in('school_id', schoolIds)

    if (!scErr && schoolContents.length > 0) {
      const scIds = schoolContents.map(sc => sc.id)
      const { data: devices, error: devErr } = await supabaseAdmin
        .from('school_devices')
        .select('school_content_id')
        .in('school_content_id', scIds)

      if (!devErr) {
        // school_content_id -> school_id 매핑 필요
        const scToSchool = new Map<string, string>()
        schoolContents.forEach(sc => scToSchool.set(sc.id, sc.school_id))

        for (const d of devices) {
          const sid = scToSchool.get(d.school_content_id)
          if (sid) {
            deviceCountBySchoolId.set(sid, (deviceCountBySchoolId.get(sid) || 0) + 1)
          }
        }
      }
    }
  }

  const items = (schools ?? []).map((s: any, idx: number) => ({
    index: from + idx + 1,
    name: s.name as string,
    group_no: s.group_no as string,
    teacher_accounts: teacherCountBySchoolId.get(s.id) || 0,
    device_count: deviceCountBySchoolId.get(s.id) || 0,
  }))

  return NextResponse.json({ items, total: count ?? 0, page, pageSize }, { status: 200 })
}
