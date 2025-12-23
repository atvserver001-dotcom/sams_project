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
  } catch {
    return { error: 'Invalid token', status: 401 as const }
  }
}

// PATCH: school_devices 메모 수정
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const memo = typeof body.memo === 'string' ? body.memo : ''

  const { data, error } = await ((supabaseAdmin as any).from('school_devices') as any)
    .update({ memo })
    .eq('id', id)
    .select('id, memo')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 200 })
}



