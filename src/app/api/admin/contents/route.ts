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

// GET: 컨텐츠 목록 (소속 디바이스 포함)
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await (supabaseAdmin as any)
    .from('contents')
    .select(`
      id,
      name,
      description,
      color_hex,
      created_at,
      content_devices(
        device_id,
        device:device_id(device_name)
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 데이터 가공: content_devices를 단순 id 배열이나 객체 배열로 변환
  const items = (data || []).map(item => ({
    ...item,
    devices: (item.content_devices || []).map((cd: any) => ({
      id: cd.device_id,
      name: cd.device?.device_name
    }))
  }))

  return NextResponse.json({ items }, { status: 200 })
}

// POST: 컨텐츠 생성
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { name, description, device_ids, color_hex } = body as { name: string; description?: string; device_ids?: string[]; color_hex?: string }

  if (!name || !name.trim()) {
    return NextResponse.json({ error: '컨텐츠 이름은 필수입니다.' }, { status: 400 })
  }

  // 1. 컨텐츠 생성
  const { data: content, error: contentError } = await ((supabaseAdmin as any)
    .from('contents') as any)
    .insert({ name: name.trim(), description, color_hex: (color_hex || '#DBEAFE') })
    .select()
    .single()

  if (contentError) return NextResponse.json({ error: contentError.message }, { status: 500 })

  // 2. 디바이스 연결
  if (device_ids && device_ids.length > 0) {
    const relations = device_ids.map(id => ({
      content_id: content.id,
      device_id: id
    }))
    const { error: relError } = await supabaseAdmin
      .from('content_devices')
      .insert(relations)

    if (relError) {
      // 실패 시 컨텐츠 삭제 고려할 수 있으나 여기서는 에러 반환
      return NextResponse.json({ error: '컨텐츠는 생성되었으나 디바이스 연결에 실패했습니다: ' + relError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ item: content }, { status: 201 })
}

