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
    if (decoded.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
    return { decoded }
  } catch (e) {
    return { error: 'Invalid token', status: 401 as const }
  }
}

// PUT: 수정
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json()
  const { username, password, role, school_id, is_active } = body as Partial<Database['public']['Tables']['operator_accounts']['Update']>

  const updatePayload: Database['public']['Tables']['operator_accounts']['Update'] = {}
  if (username !== undefined) updatePayload.username = username
  if (password !== undefined) updatePayload.password = password
  if (role !== undefined) updatePayload.role = role
  if (school_id !== undefined) updatePayload.school_id = school_id
  if (is_active !== undefined) updatePayload.is_active = is_active

  const { data, error } = await (supabaseAdmin
    .from('operator_accounts') as any)
    .update(updatePayload as Database['public']['Tables']['operator_accounts']['Update'])
    .eq('id', id)
    .select('id, username, password, role, school_id, is_active')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data }, { status: 200 })
}

// DELETE: 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const { error } = await supabaseAdmin
    .from('operator_accounts')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true }, { status: 200 })
}


