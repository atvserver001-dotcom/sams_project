'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

type OperatorRole = 'admin' | 'school'

interface OperatorAccountItem {
  id: string
  username: string
  password: string
  role: OperatorRole
  school_id?: string | null
  is_active: boolean
}

interface SchoolBriefMap {
  [schoolId: string]: { group_no: string; name: string; min_end_date?: string | null }
}

export default function AccountsPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<OperatorAccountItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string>('')
  const [schoolMap, setSchoolMap] = useState<SchoolBriefMap>({})

  // form state
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<OperatorAccountItem>>({
    username: '',
    password: '',
    role: 'school',
    school_id: '',
    is_active: true,
  })

  // filters
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'school'>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [groupNoQuery, setGroupNoQuery] = useState('')
  const [schoolNameQuery, setSchoolNameQuery] = useState('')

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      const res = await fetch(`/api/admin/accounts?${params.toString()}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '목록 조회 실패')
      setItems(data.items)
      setTotal(data.total || 0)
    } catch (e: any) {
      setError(e.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }

  const fetchSchools = async () => {
    try {
      const res = await fetch('/api/admin/schools', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '학교 목록 조회 실패')
      const map: SchoolBriefMap = {}
      for (const item of (data.items || [])) {
        if (item && item.id) {
          map[item.id] = { group_no: item.group_no, name: item.name, min_end_date: (item as any).min_end_date ?? null }
        }
      }
      setSchoolMap(map)
    } catch (e) {
      // 학교 정보가 없어도 계정 목록은 보여야 하므로 오류는 조용히 무시
    }
  }

  useEffect(() => {
    if (isAdmin) fetchList()
  }, [isAdmin, page])

  useEffect(() => {
    if (isAdmin) fetchSchools()
  }, [isAdmin])

  const handleOpenCreate = () => {
    setEditingId(null)
    setForm({ username: '', password: '', role: 'school', school_id: '', is_active: true })
    setIsOpen(true)
  }

  const handleOpenEdit = (row: OperatorAccountItem) => {
    setEditingId(row.id)
    setForm({
      username: row.username,
      password: row.password,
      role: row.role,
      school_id: row.school_id ?? '',
      is_active: row.is_active,
    })
    setIsOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/admin/accounts/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      await fetchList()
    } catch (e: any) {
      alert(e.message || '삭제 실패')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // 학교 계정은 학교 선택 필수
      if (form.role === 'school' && !form.school_id) {
        alert('학교 계정은 학교 선택이 필수입니다.')
        return
      }
      const payload = {
        username: form.username,
        password: form.password,
        role: form.role,
        school_id: form.role === 'school' ? (form.school_id || null) : null,
        is_active: !!form.is_active,
      }
      const res = await fetch(editingId ? `/api/admin/accounts/${editingId}` : '/api/admin/accounts', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      setIsOpen(false)
      await fetchList()
    } catch (e: any) {
      alert(e.message || '저장 실패')
    }
  }

  const rows = useMemo(() => items.map((item, index) => ({ index: index + 1, ...item })), [items])
  const filteredRows = useMemo(() => {
    const gq = groupNoQuery.trim().toLowerCase()
    const sq = schoolNameQuery.trim().toLowerCase()
    return rows.filter((row) => {
      if (roleFilter !== 'all' && row.role !== roleFilter) return false
      if (activeFilter !== 'all') {
        if (activeFilter === 'active' && !row.is_active) return false
        if (activeFilter === 'inactive' && row.is_active) return false
      }
      const school = row.school_id ? schoolMap[row.school_id] : undefined
      const groupNo = (school?.group_no || '').toLowerCase()
      const schoolName = (school?.name || '').toLowerCase()
      if (gq && !groupNo.includes(gq)) return false
      if (sq && !schoolName.includes(sq)) return false
      return true
    })
  }, [rows, roleFilter, activeFilter, groupNoQuery, schoolNameQuery, schoolMap])
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])
  useEffect(() => {
    setPage(1)
  }, [roleFilter, activeFilter, groupNoQuery, schoolNameQuery])
  const schoolOptions = useMemo(() => {
    return Object.entries(schoolMap)
      .map(([id, v]) => ({ id, name: v.name, group_no: v.group_no }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [schoolMap])

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">계정관리</h1>
        <button onClick={handleOpenCreate} className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-md text-sm font-medium border border-white/30">생성</button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white/95 rounded-lg shadow p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">권한</label>
            <select
              className="block w-40 h-10 px-3 rounded border border-gray-300 bg-white text-sm text-gray-900"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'school')}
            >
              <option value="all">전체</option>
              <option value="admin">관리자</option>
              <option value="school">학교 계정</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">활성화</label>
            <select
              className="block w-40 h-10 px-3 rounded border border-gray-300 bg-white text-sm text-gray-900"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">전체</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">그룹번호</label>
            <input
              className="block w-48 h-10 px-3 rounded border border-gray-300 bg-white text-sm text-gray-900"
              placeholder="그룹번호"
              value={groupNoQuery}
              onChange={(e) => setGroupNoQuery(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">소속학교</label>
            <input
              className="block w-64 h-10 px-3 rounded border border-gray-300 bg-white text-sm text-gray-900"
              placeholder="학교명 검색"
              value={schoolNameQuery}
              onChange={(e) => setSchoolNameQuery(e.target.value)}
            />
          </div>
          <div className="ml-auto">
            <button
              onClick={() => { setRoleFilter('all'); setActiveFilter('all'); setGroupNoQuery(''); setSchoolNameQuery('') }}
              className="h-10 px-3 rounded border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
            >초기화</button>
          </div>
        </div>
      </div>

      <div className="bg-white/95 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비밀번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">권한</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">그룹번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">소속학교</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">활성화</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">특이사항</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">불러오는 중...</td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">데이터가 없습니다.</td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.index}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.username}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.password}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.role === 'admin' ? '관리자' : '학교 계정'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.school_id ? (schoolMap[row.school_id]?.group_no || '-') : '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.school_id ? (schoolMap[row.school_id]?.name || '-') : '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${row.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                      {row.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {(() => {
                    const s = row.school_id ? schoolMap[row.school_id] : undefined
                    const end = s?.min_end_date || null
                    if (!end) return '-'
                    const today = new Date()
                    const endDate = new Date(end + 'T00:00:00')
                    const diffMs = endDate.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                    if (diffDays < 0) {
                      return <span className="text-red-600">기간종료({diffDays}일)</span>
                    }
                    return <span className="text-gray-900">{diffDays}일 남음</span>
                  })()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => handleOpenEdit(row)} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">수정</button>
                      <button onClick={() => handleDelete(row.id)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded">삭제</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/80">총 {filteredRows.length}건 • 페이지 {page} / {Math.max(1, Math.ceil((filteredRows.length || 1) / pageSize))}</div>
        <div className="inline-flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/30"
          >이전</button>
          <button
            disabled={page >= Math.ceil((filteredRows.length || 1) / pageSize)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/30"
          >다음</button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? '계정 수정' : '계정 생성'}</h2>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900" value={form.username || ''} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900" value={form.password || ''} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">권한</label>
                <select
                  className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                  value={form.role}
                  onChange={(e) => {
                    const v = e.target.value as OperatorRole
                    setForm((s) => ({ ...s, role: v, school_id: v === 'admin' ? '' : s.school_id }))
                  }}
                >
                  <option value="admin">관리자</option>
                  <option value="school">학교 계정</option>
                </select>
              </div>
              {form.role === 'school' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">학교 선택</label>
                  <select
                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                    value={form.school_id || ''}
                    onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))}
                    required={form.role === 'school'}
                  >
                    <option value="">-- 학교 선택 --</option>
                    {schoolOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input id="is_active" type="checkbox" checked={!!form.is_active} onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))} className="h-4 w-4" />
                <label htmlFor="is_active" className="text-sm text-gray-700">활성화</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500">취소</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


