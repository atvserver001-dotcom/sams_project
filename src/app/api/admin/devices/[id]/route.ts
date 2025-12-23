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

// PUT: 디바이스 이름 수정
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json()
  const { device_name } = body as { device_name?: string }
  const updatePayload: { device_name?: string } = {}
  if (device_name !== undefined) {
    if (!device_name.trim()) return NextResponse.json({ error: 'device_name은 비울 수 없습니다.' }, { status: 400 })
    updatePayload.device_name = device_name.trim()
  }

  const { data, error } = await (supabaseAdmin
    .from('devices') as any)
    .update(updatePayload)
    .eq('id', id)
    .select('id, device_name, sort_order, icon_path')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const icon_path = (data as any)?.icon_path ?? null
  const { data: signed } = icon_path
    ? await supabaseAdmin.storage.from(ICON_BUCKET).createSignedUrl(String(icon_path), 60 * 60 * 24)
    : { data: null as any }
  return NextResponse.json({ item: { ...data, icon_url: signed?.signedUrl || null } }, { status: 200 })
}

// DELETE: 디바이스 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  // 주의: device_management FK 제약 조건으로 인해 참조 중인 경우 삭제 실패 가능
  const { error } = await supabaseAdmin
    .from('devices')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true }, { status: 200 })
}


