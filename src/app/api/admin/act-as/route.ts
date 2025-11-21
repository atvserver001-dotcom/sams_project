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

// 관리자: 특정 학교로 acting 컨텍스트 설정 (group_no 기반)
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const groupNo = searchParams.get('group_no')
  if (!groupNo) return NextResponse.json({ error: 'group_no가 필요합니다.' }, { status: 400 })

  const { data: school, error } = await supabaseAdmin
    .from('schools')
    .select('id, group_no, name')
    .eq('group_no', groupNo)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: '해당 그룹번호의 학교가 없습니다.' }, { status: 404 })

  const res = NextResponse.json({ success: true, school: { id: (school as any).id, group_no: (school as any).group_no, name: (school as any).name } })
  // acting 컨텍스트 쿠키 설정
  res.cookies.set('acting_school_id', String((school as any).id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7일
    path: '/',
  })
  res.cookies.set('acting_group_no', String((school as any).group_no), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}

// acting 해제
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const res = NextResponse.json({ success: true })
  res.cookies.set('acting_school_id', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' })
  res.cookies.set('acting_group_no', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' })
  return res
}

// acting 연장: 현재 acting_* 쿠키가 있으면 동일 값으로 재설정하여 만료 갱신
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const actingSchoolId = req.cookies.get('acting_school_id')?.value
  const actingGroupNo = req.cookies.get('acting_group_no')?.value
  if (!actingSchoolId || !actingGroupNo) {
    return NextResponse.json({ error: 'acting 컨텍스트가 없습니다.' }, { status: 400 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set('acting_school_id', String(actingSchoolId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  res.cookies.set('acting_group_no', String(actingGroupNo), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}


