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

// GET: 컨텐츠 상세
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('contents')
    .select(`
      id,
      name,
      description,
      content_devices(
        device_id,
        device:device_id(device_name)
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const item = {
    ...data,
    devices: (data.content_devices || []).map((cd: any) => ({
      id: cd.device_id,
      name: cd.device?.device_name
    }))
  }

  return NextResponse.json({ item }, { status: 200 })
}

// PUT: 컨텐츠 수정
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json()
  const { name, description, device_ids } = body as { name?: string; description?: string; device_ids?: string[] }

  // 1. 기본 정보 수정
  if (name || description !== undefined) {
    const updateData: any = {}
    if (name) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description

    const { error: updError } = await (supabaseAdmin
      .from('contents') as any)
      .update(updateData)
      .eq('id', id)

    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
  }

  // 2. 디바이스 관계 수정 (전체 삭제 후 재삽입)
  if (device_ids) {
    // 기존 관계 삭제
    const { error: delError } = await (supabaseAdmin
      .from('content_devices') as any)
      .delete()
      .eq('content_id', id)

    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    // 새 관계 삽입
    if (device_ids.length > 0) {
      const relations = device_ids.map(devId => ({
        content_id: id,
        device_id: devId
      }))
      const { error: insError } = await supabaseAdmin
        .from('content_devices')
        .insert(relations)

      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true }, { status: 200 })
}

// DELETE: 컨텐츠 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const { error } = await (supabaseAdmin
    .from('contents') as any)
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true }, { status: 200 })
}
