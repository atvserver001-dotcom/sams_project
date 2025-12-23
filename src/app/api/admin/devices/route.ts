export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'

const ICON_BUCKET = 'device-icons'

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

// GET: 디바이스 마스터 목록
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id, device_name, sort_order, icon_path')
    .order('sort_order', { ascending: true, nullsFirst: true })
    .order('device_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as any[]
  const items = await Promise.all(rows.map(async (r) => {
    const icon_path = r.icon_path ?? null
    if (!icon_path) return { ...r, icon_url: null }
    const { data: signed } = await supabaseAdmin.storage.from(ICON_BUCKET).createSignedUrl(String(icon_path), 60 * 60 * 24)
    return { ...r, icon_url: signed?.signedUrl || null }
  }))

  return NextResponse.json({ items }, { status: 200 })
}

// POST: 디바이스 생성
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { device_name } = body as { device_name?: string }
  if (!device_name || !device_name.trim()) {
    return NextResponse.json({ error: 'device_name은 필수입니다.' }, { status: 400 })
  }

  const { data, error } = await (supabaseAdmin
    .from('devices') as any)
    .insert({ device_name: device_name.trim() })
    .select('id, device_name, sort_order, icon_path')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: { ...data, icon_url: null } }, { status: 201 })
}

// POST /reorder: 디바이스 일괄 정렬 저장
export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { order } = body as { order?: string[] }
  if (!Array.isArray(order)) return NextResponse.json({ error: 'order는 string[] 이어야 합니다.' }, { status: 400 })

  // 순차 업데이트 (작은 배열 기준). 대규모면 RPC/UPSERT로 최적화 고려
  for (let i = 0; i < order.length; i++) {
    const id = order[i]
    const { error: updErr } = await (supabaseAdmin
      .from('devices') as any)
      .update({ sort_order: i })
      .eq('id', id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }
  return NextResponse.json({ success: true }, { status: 200 })
}


