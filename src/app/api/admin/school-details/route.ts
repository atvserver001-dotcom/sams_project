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
// 반환 항목: 번호(index), 학교이름(name), 그룹번호(group_no), 교사 계정 수(teacher_accounts), 제품 구성 수(device_count)
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

  const groupNos = (schools ?? []).map((s: any) => s.group_no as string)
  const schoolIds = (schools ?? []).map((s: any) => s.id as string)
  const idToGroupNo = new Map<string, string>((schools ?? []).map((s: any) => [s.id as string, s.group_no as string]))

  // 2) 교사 계정 수 집계: operator_accounts where role='school' and school_id == group_no
  let teacherCountByGroupNo = new Map<string, number>()
  if (schoolIds.length) {
    const { data: accountsById, error: accErrById } = await supabaseAdmin
      .from('operator_accounts')
      .select('school_id, role')
      .in('school_id', schoolIds)

    if (accErrById) return NextResponse.json({ error: accErrById.message }, { status: 500 })

    for (const r of (accountsById ?? []) as Array<{ school_id: string | null; role: string }>) {
      if (r.school_id && r.role === 'school') {
        const gno = idToGroupNo.get(r.school_id)
        if (gno) {
          teacherCountByGroupNo.set(gno, (teacherCountByGroupNo.get(gno) || 0) + 1)
        }
      }
    }
  }

  // 3) 제품 구성 수 집계: device_management where group_no in (...) (행 수)
  let deviceCountByGroupNo = new Map<string, number>()
  if (schoolIds.length) {
    const { data: mgmtById, error: mgmtErrById } = await supabaseAdmin
      .from('device_management')
      .select('school_id')
      .in('school_id', schoolIds)

    if (mgmtErrById) return NextResponse.json({ error: mgmtErrById.message }, { status: 500 })

    for (const r of (mgmtById ?? []) as Array<{ school_id: string }>) {
      const gno = idToGroupNo.get(r.school_id)
      if (gno) {
        deviceCountByGroupNo.set(gno, (deviceCountByGroupNo.get(gno) || 0) + 1)
      }
    }
  }

  const items = (schools ?? []).map((s: any, idx: number) => ({
    index: from + idx + 1,
    name: s.name as string,
    group_no: s.group_no as string,
    teacher_accounts: teacherCountByGroupNo.get(s.group_no) || 0,
    device_count: deviceCountByGroupNo.get(s.group_no) || 0,
  }))

  return NextResponse.json({ items, total: count ?? 0, page, pageSize }, { status: 200 })
}


