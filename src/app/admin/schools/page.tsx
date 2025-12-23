'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface SchoolDeviceItem {
  id?: string
  device_id?: string
  device_name: string
  auth_key: string
  created_at?: string
  memo?: string
}
interface SchoolContentItem {
  id: string
  name: string
  period: string
  start_date?: string | null
  end_date?: string | null
  is_unlimited?: boolean
  color_hex?: string | null
  devices: SchoolDeviceItem[]
}
interface SchoolListItem {
  id: string
  group_no: string
  name: string
  school_type: 1 | 2 | 3
  recognition_key?: string
  contents: SchoolContentItem[]
}

interface ContentMaster {
  id: string
  name: string
  devices: { id: string; name: string }[]
}

interface ContentAssignment {
  content_id: string
  name: string
  start_date: string | null
  end_date: string | null
  is_unlimited: boolean
  device_quantities: { [device_id: string]: number }
  // 수정 모달에서만 사용: 기존 발급된 school_devices 목록(개별 삭제를 위해 id/device_id 포함)
  existing_devices?: SchoolDeviceItem[]
  // 수정 모달에서 개별 삭제로 선택된 school_device.id들 (저장 시 서버로 전달)
  remove_school_device_ids?: string[]
  // 수정 모달에서 "추가" 버튼으로 증가시킨 신규(아직 DB 반영 전) 인스턴스 수
  pending_additions?: { [device_id: string]: number }
}

export default function SchoolsPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<SchoolListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ group_no: string; name: string; school_type: 1 | 2 | 3 }>({
    group_no: '',
    name: '',
    school_type: 1,
  })
  const [contentAssignments, setContentAssignments] = useState<ContentAssignment[]>([])
  const [formError, setFormError] = useState<string>('')

  const [memoModalOpen, setMemoModalOpen] = useState(false)
  const [memoTarget, setMemoTarget] = useState<{ schoolDeviceId: string; label: string } | null>(null)
  const [memoText, setMemoText] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)

  const [contentMaster, setContentMaster] = useState<ContentMaster[]>([])
  const [modalLoading, setModalLoading] = useState(false)

  const fetchContents = async () => {
    try {
      const res = await fetch('/api/admin/contents', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '컨텐츠 목록 조회 실패')
      setContentMaster(data.items || [])
    } catch (e: any) {
      console.error(e)
    }
  }

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/schools`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '목록 조회 실패')
      setItems(data.items)
    } catch (e: any) {
      setError(e.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }
  const openMemoModal = (schoolDeviceId: string, label: string, currentMemo: string | undefined) => {
    setMemoTarget({ schoolDeviceId, label })
    setMemoText(currentMemo || '')
    setMemoModalOpen(true)
  }

  const saveMemo = async () => {
    if (!memoTarget) return
    setMemoSaving(true)
    try {
      const res = await fetch(`/api/admin/school-devices/${memoTarget.schoolDeviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memo: memoText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '메모 저장 실패')

      // 로컬 상태 반영
      setItems((prev) =>
        prev.map((school) => ({
          ...school,
          contents: school.contents.map((c) => ({
            ...c,
            devices: c.devices.map((d: any) => (d.id === memoTarget.schoolDeviceId ? { ...d, memo: memoText } : d)),
          })),
        })),
      )

      setMemoModalOpen(false)
      setMemoTarget(null)
    } catch (e: any) {
      alert(e.message || '메모 저장 실패')
    } finally {
      setMemoSaving(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      fetchList()
      fetchContents()
    }
  }, [isAdmin])

  const handleOpenCreate = () => {
    setEditingId(null)
    setForm({ group_no: '', name: '', school_type: 1 })
    setContentAssignments([])
    setFormError('')
    setIsOpen(true)
  }

  const sortInstances = (arr: SchoolDeviceItem[]) => {
    return [...arr].sort((a, b) => {
      const ad = a.created_at || ''
      const bd = b.created_at || ''
      if (ad !== bd) return ad.localeCompare(bd)
      return String(a.id || '').localeCompare(String(b.id || ''))
    })
  }

  const handleOpenEdit = async (row: SchoolListItem) => {
    setModalLoading(true)
    setEditingId(row.group_no)
    setForm({ group_no: row.group_no, name: row.name, school_type: row.school_type })
    setContentAssignments([])
    setFormError('')
    setIsOpen(true)
    
    try {
      const res = await fetch(`/api/admin/schools/${row.group_no}`, { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        const assignments: ContentAssignment[] = (data.contents || []).map((c: any) => {
          // 각 디바이스별 수량 계산
          const quantities: { [id: string]: number } = {}
          c.devices.forEach((d: any) => {
            quantities[d.device_id] = (quantities[d.device_id] || 0) + 1
          })
          
          return {
            content_id: c.content_id,
            name: c.name,
            start_date: c.start_date || null,
            end_date: c.end_date || null,
            is_unlimited: !!c.is_unlimited,
            device_quantities: quantities,
            existing_devices: c.devices,
            remove_school_device_ids: [],
            pending_additions: {},
          }
        })
        setContentAssignments(assignments)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setModalLoading(false)
    }
  }

  const handleDelete = async (groupNo: string) => {
    if (!confirm('학교의 모든 데이터가 삭제됩니다. 정말 삭제 하시겠습니까?')) return
    try {
      const res = await fetch(`/api/admin/schools/${groupNo}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '삭제 실패')
      }
      await fetchList()
    } catch (e: any) {
      alert(e.message || '삭제 실패')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    
    try {
      if (!/^\d{4}$/.test(form.group_no)) return setFormError('그룹번호는 숫자 4자리여야 합니다.')
      
      const payload = {
        ...form,
        content_assignments: contentAssignments.map(a => ({
          content_id: a.content_id,
          start_date: a.start_date,
          end_date: a.end_date,
          is_unlimited: a.is_unlimited,
          remove_school_device_ids: (a.remove_school_device_ids || []).filter(Boolean),
          device_quantities: Object.entries(a.device_quantities).map(([device_id, quantity]) => ({
            device_id,
            quantity
          }))
        }))
      }

      const res = await fetch(editingId ? `/api/admin/schools/${editingId}` : '/api/admin/schools', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '저장 실패')
      }
      
      setIsOpen(false)
      await fetchList()
    } catch (e: any) {
      setFormError(e.message || '저장 실패')
    }
  }

  const toggleContent = (content: ContentMaster, checked: boolean) => {
    if (checked) {
      const initialQuantities: { [id: string]: number } = {}
      content.devices.forEach(d => initialQuantities[d.id] = 1)
      
      setContentAssignments(prev => [...prev, {
        content_id: content.id,
        name: content.name,
        start_date: null,
        end_date: null,
        is_unlimited: true,
        device_quantities: initialQuantities,
        remove_school_device_ids: [],
        pending_additions: {},
      }])
    } else {
      setContentAssignments(prev => prev.filter(a => a.content_id !== content.id))
    }
  }

  const startOfToday = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }

  const diffDays = (endDateStr: string) => {
    const end = new Date(endDateStr)
    end.setHours(0, 0, 0, 0)
    const today = startOfToday()
    const ms = end.getTime() - today.getTime()
    return Math.ceil(ms / (1000 * 60 * 60 * 24))
  }

  const renderPeriod = (c: SchoolContentItem) => {
    if (c.is_unlimited) {
      return <div className="text-xs text-gray-500">제한없음</div>
    }

    const hasDateRange = !!(c.start_date && c.end_date)
    const dateRangeText = hasDateRange ? `${c.start_date} ~ ${c.end_date}` : c.period

    if (c.end_date) {
      const days = diffDays(c.end_date)
      return (
        <div className="space-y-0.5">
          <div className="text-xs text-gray-500">{dateRangeText}</div>
          {days < 0 ? (
            <div className="text-xs font-semibold text-red-600">기간종료({days}일)</div>
          ) : (
            <div className="text-xs font-semibold text-emerald-600">{days}일 남음</div>
          )}
        </div>
      )
    }

    return <div className="text-xs text-gray-500">{dateRangeText}</div>
  }

  const renderDeviceKeys = (devices: SchoolDeviceItem[]) => {
    // 보기 좋게 정렬: 디바이스명 -> created_at -> auth_key
    const sorted = [...devices].sort((a, b) => {
      const nn = (a.device_name || '').localeCompare(b.device_name || '')
      if (nn !== 0) return nn
      const ad = a.created_at || ''
      const bd = b.created_at || ''
      if (ad !== bd) return ad.localeCompare(bd)
      return (a.auth_key || '').localeCompare(b.auth_key || '')
    })

    const counter = new Map<string, number>()
    return sorted.map((d, i) => {
      const n = (counter.get(d.device_name) || 0) + 1
      counter.set(d.device_name, n)
      return (
        <div key={`${d.device_name}-${d.auth_key}-${i}`} className="text-xs flex gap-2 items-center whitespace-nowrap">
          <span className="text-gray-600 w-28 truncate">{d.device_name} #{n}:</span>
          <code className="bg-gray-100 px-1 rounded text-red-600 font-mono">{d.auth_key}</code>
          <button
            type="button"
            onClick={() => openMemoModal(String((d as any).id), `${d.device_name} #${n}`, d.memo)}
            className="ml-2 px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-[11px]"
          >
            메모
          </button>
          {d.memo && (
            <span className="ml-2 text-[11px] text-gray-500 truncate max-w-[160px]" title={d.memo}>
              {d.memo}
            </span>
          )}
        </div>
      )
    })
  }

  const hashToIndex = (s: string, mod: number) => {
    let h = 0
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0
    }
    return mod === 0 ? 0 : h % mod
  }

  const themeKey = (c: any) => String(c?.id || c?.content_id || c?.name || '')

  const fallbackPalette = ['#DBEAFE', '#DCFCE7', '#FEF3C7', '#FFE4E6', '#EDE9FE', '#CFFAFE', '#ECFCCB', '#E0F2FE']

  const resolveContentHex = (c: any) => {
    const v = String(c?.color_hex || '').trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
    // fallback: 컨텐츠별로 고정되게 해시 기반 선택
    return fallbackPalette[hashToIndex(themeKey(c), fallbackPalette.length)]
  }

  const borderFromHex = (hex: string) => {
    // 아주 간단히 border는 고정 색으로 (UX: 대비 안정적)
    return '#CBD5E1' // slate-300
  }

  const renderContentBadge = (c: any) => {
    const bg = resolveContentHex(c)
    return (
      <div
        className="inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-bold text-gray-900 shadow-sm"
        style={{ backgroundColor: bg, borderColor: borderFromHex(bg) }}
      >
        {c.name}
      </div>
    )
  }

  const renderContentDeviceCard = (c: any) => {
    const bg = resolveContentHex(c)
    return (
      <div key={c.id} className="rounded-md border p-2" style={{ backgroundColor: bg, borderColor: borderFromHex(bg) }}>
        <div className="text-xs font-semibold text-gray-700 mb-1">{c.name}</div>
        <div className="border-l-2 border-gray-200 pl-2 space-y-1">{renderDeviceKeys(c.devices)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">학교관리</h1>
        <button onClick={handleOpenCreate} className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-md text-sm font-medium border border-white/30">생성</button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white/95 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">학교 정보</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">할당된 컨텐츠</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">디바이스 및 인증키</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">데이터가 없습니다.</td></tr>
            ) : (
              items.map((row, rowIdx) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-sm text-gray-900 align-top">{rowIdx + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 align-top">
                    <div className="font-bold">{row.name}</div>
                    <div className="text-xs text-gray-500">그룹: {row.group_no} | {row.school_type === 1 ? '초등' : row.school_type === 2 ? '중등' : '고등'}</div>
                    <div className="text-xs text-gray-500 mt-1">인식키: {row.recognition_key}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 align-top">
                    {row.contents.map(c => (
                      <div key={c.id} className="mb-2 last:mb-0">
                        {renderContentBadge(c)}
                        {renderPeriod(c)}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 align-top">
                    <div className="space-y-2">
                      {row.contents.map((c) => renderContentDeviceCard(c))}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm align-top">
                    <div className="flex flex-col gap-2">
                      <button onClick={() => handleOpenEdit(row)} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">수정</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 메모 모달 */}
      {memoModalOpen && memoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">메모 - {memoTarget.label}</h3>
              <button
                type="button"
                onClick={() => {
                  if (memoSaving) return
                  setMemoModalOpen(false)
                  setMemoTarget(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                닫기
              </button>
            </div>
            <textarea
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
              rows={4}
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              placeholder="메모를 입력하세요"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  if (memoSaving) return
                  setMemoModalOpen(false)
                  setMemoTarget(null)
                }}
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500 text-white"
              >
                취소
              </button>
              <button
                type="button"
                disabled={memoSaving}
                onClick={saveMemo}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? '학교 수정' : '학교 생성'}</h2>
            {modalLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-700">
                <div className="h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-3" />
                <div className="text-sm">불러오는 중...</div>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">그룹번호</label>
                    <input
                      className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                      value={form.group_no}
                      onChange={(e) => setForm(s => ({ ...s, group_no: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      required
                      placeholder="4자리 숫자"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">학교 이름</label>
                    <input className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900" value={form.name} onChange={(e) => setForm(s => ({ ...s, name: e.target.value }))} required />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">학교 종류</label>
                  <select
                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                    value={form.school_type}
                    onChange={(e) => setForm((s) => ({ ...s, school_type: Number(e.target.value) as 1 | 2 | 3 }))}
                    required
                  >
                    <option value={1}>초등학교</option>
                    <option value={2}>중학교</option>
                    <option value={3}>고등학교</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">컨텐츠 선택</label>
                  <div className="grid grid-cols-3 gap-2">
                    {contentMaster.map(c => (
                      <label key={c.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${contentAssignments.some(a => a.content_id === c.id) ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={contentAssignments.some(a => a.content_id === c.id)}
                          onChange={(e) => toggleContent(c, e.target.checked)}
                        />
                        <span className="text-sm font-medium">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {contentAssignments.length > 0 && (
                  <div className="space-y-4 border-t pt-4">
                    <label className="block text-sm font-medium text-gray-700">컨텐츠별 설정</label>
                    {contentAssignments.map((a, idx) => {
                      const master = contentMaster.find(m => m.id === a.content_id)
                      return (
                        <div key={a.content_id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-900">{a.name}</h3>
                            <div className="flex items-center gap-2">
                              <label className="inline-flex items-center gap-1 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={a.is_unlimited}
                                  onChange={(e) => {
                                    const next = [...contentAssignments]
                                    next[idx].is_unlimited = e.target.checked
                                    setContentAssignments(next)
                                  }}
                                />
                                무제한
                              </label>
                              {!a.is_unlimited && (
                                <div className="flex gap-1">
                                  <input type="date" className="text-xs border rounded px-1 py-0.5 text-gray-900" value={a.start_date || ''} onChange={e => {
                                    const next = [...contentAssignments]; next[idx].start_date = e.target.value; setContentAssignments(next)
                                  }} />
                                  <span className="text-gray-400">~</span>
                                  <input type="date" className="text-xs border rounded px-1 py-0.5 text-gray-900" value={a.end_date || ''} onChange={e => {
                                    const next = [...contentAssignments]; next[idx].end_date = e.target.value; setContentAssignments(next)
                                  }} />
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-500">디바이스 수량 설정</label>
                            {master?.devices.map(d => (
                              <div key={d.id} className="bg-white p-2 rounded border border-gray-100 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-gray-700">{d.name}</span>
                                  <div className="flex items-center gap-2">
                                    {!editingId && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = [...contentAssignments]
                                          const assignment: ContentAssignment = {
                                            ...next[idx],
                                            device_quantities: { ...next[idx].device_quantities },
                                            existing_devices: next[idx].existing_devices ? [...next[idx].existing_devices!] : undefined,
                                            remove_school_device_ids: next[idx].remove_school_device_ids ? [...next[idx].remove_school_device_ids!] : [],
                                            pending_additions: next[idx].pending_additions ? { ...next[idx].pending_additions } : {},
                                          }

                                          const val = assignment.device_quantities[d.id] || 0
                                          if (val <= 0) return

                                          assignment.device_quantities[d.id] = Math.max(0, val - 1)
                                          next[idx] = assignment
                                          setContentAssignments(next)
                                        }}
                                        className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded text-gray-600"
                                        title="수량 감소"
                                      >
                                        -
                                      </button>
                                    )}
                                    <span className="text-sm font-mono w-4 text-center text-gray-900">{a.device_quantities[d.id] || 0}</span>
                                    {!editingId ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = [...contentAssignments]
                                          const assignment = { ...next[idx], device_quantities: { ...next[idx].device_quantities } }
                                          assignment.device_quantities[d.id] = (assignment.device_quantities[d.id] || 0) + 1
                                          next[idx] = assignment
                                          setContentAssignments(next)
                                        }}
                                        className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded text-gray-600"
                                        title="수량 증가"
                                      >
                                        +
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = [...contentAssignments]
                                          const assignment: ContentAssignment = {
                                            ...next[idx],
                                            device_quantities: { ...next[idx].device_quantities },
                                            pending_additions: next[idx].pending_additions ? { ...next[idx].pending_additions } : {},
                                          }

                                          assignment.device_quantities[d.id] = (assignment.device_quantities[d.id] || 0) + 1
                                          assignment.pending_additions = assignment.pending_additions || {}
                                          assignment.pending_additions[d.id] = (assignment.pending_additions[d.id] || 0) + 1

                                          next[idx] = assignment
                                          setContentAssignments(next)
                                        }}
                                        className="px-2.5 py-1 rounded border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-[11px] font-medium"
                                        title="인스턴스 추가(저장 시 발급)"
                                      >
                                        추가
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* 개별 인스턴스 삭제/취소 UI (수정 모달에서만) */}
                                {editingId &&
                                  (((a.existing_devices || []).some((x) => x.device_id === d.id && !!x.id) ||
                                    ((a.pending_additions || {})[d.id] || 0) > 0)) && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[11px] text-gray-500 mr-1">개별삭제</span>

                                    {/* 기존 발급분 */}
                                    {sortInstances((a.existing_devices || []).filter((x) => x.device_id === d.id && !!x.id)).map((inst, instIdx) => (
                                      <button
                                        key={String(inst.id)}
                                        type="button"
                                        onClick={() => {
                                          const next = [...contentAssignments]
                                          const assignment: ContentAssignment = {
                                            ...next[idx],
                                            device_quantities: { ...next[idx].device_quantities },
                                            existing_devices: next[idx].existing_devices ? [...next[idx].existing_devices!] : undefined,
                                            remove_school_device_ids: next[idx].remove_school_device_ids ? [...next[idx].remove_school_device_ids!] : [],
                                            pending_additions: next[idx].pending_additions ? { ...next[idx].pending_additions } : {},
                                          }

                                          if (!inst.id) return

                                          assignment.remove_school_device_ids = Array.from(
                                            new Set([...(assignment.remove_school_device_ids || []), String(inst.id)]),
                                          )
                                          assignment.existing_devices = (assignment.existing_devices || []).filter((x) => String(x.id) !== String(inst.id))

                                          // UI 수량도 같이 감소
                                          const cur = assignment.device_quantities[d.id] || 0
                                          assignment.device_quantities[d.id] = Math.max(0, cur - 1)

                                          next[idx] = assignment
                                          setContentAssignments(next)
                                        }}
                                        className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] text-rose-800 hover:bg-rose-200"
                                        title={`#${instIdx + 1}, ${inst.auth_key} 삭제`}
                                      >
                                        <span className="font-mono">#{instIdx + 1},</span>
                                        <span className="font-mono text-[10px] text-rose-700/80 max-w-[160px] truncate" title={inst.auth_key}>
                                          {inst.auth_key}
                                        </span>
                                        <span className="text-rose-700">✕</span>
                                      </button>
                                    ))}

                                    {/* 추가 대기분(저장 시 생성될 인스턴스) */}
                                    {(() => {
                                      const existingCount = sortInstances((a.existing_devices || []).filter((x) => x.device_id === d.id && !!x.id)).length
                                      const pending = (a.pending_additions || {})[d.id] || 0
                                      if (pending <= 0) return null

                                      return Array.from({ length: pending }).map((_, pi) => {
                                        const labelNum = existingCount + pi + 1
                                        return (
                                          <button
                                            key={`pending-${d.id}-${pi}-${labelNum}`}
                                            type="button"
                                            onClick={() => {
                                              const next = [...contentAssignments]
                                              const assignment: ContentAssignment = {
                                                ...next[idx],
                                                device_quantities: { ...next[idx].device_quantities },
                                                pending_additions: next[idx].pending_additions ? { ...next[idx].pending_additions } : {},
                                              }

                                              const curPending = (assignment.pending_additions || {})[d.id] || 0
                                              if (curPending <= 0) return

                                              // pending 1개 취소 + 수량 1 감소
                                              assignment.pending_additions = assignment.pending_additions || {}
                                              assignment.pending_additions[d.id] = Math.max(0, curPending - 1)
                                              const curQty = assignment.device_quantities[d.id] || 0
                                              assignment.device_quantities[d.id] = Math.max(0, curQty - 1)

                                              next[idx] = assignment
                                              setContentAssignments(next)
                                            }}
                                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] text-rose-800 hover:bg-rose-200"
                                            title={`#${labelNum} 추가대기(취소)`}
                                          >
                                            <span className="font-mono">#{labelNum}</span>
                                            <span className="text-rose-700">✕</span>
                                          </button>
                                        )
                                      })
                                    })()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* 인증키 영역 제거 (인증키는 저장 시 유지/추가/삭제로 관리) */}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t">
                  {editingId ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const groupNo = editingId
                        await handleDelete(groupNo)
                        // 삭제 성공 시 목록이 갱신되므로 모달도 닫아 UX 정리
                        setIsOpen(false)
                      }}
                      className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
                    >
                      삭제
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500">취소</button>
                    <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium">저장</button>
                  </div>
                </div>
                {formError && <p className="text-sm text-red-600 pt-2">{formError}</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
