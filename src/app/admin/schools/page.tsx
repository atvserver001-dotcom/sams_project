'use client'

import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface SchoolDeviceItem {
  id?: string
  device_id?: string
  device_name: string
  auth_key: string
  created_at?: string
  memo?: string
  link_group_id?: string | null
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
  has_linkable?: boolean
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

  // 연동 모달 state
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkSchool, setLinkSchool] = useState<SchoolListItem | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkGroups, setLinkGroups] = useState<any[]>([])
  const [linkAvailable, setLinkAvailable] = useState<any[]>([])
  const [linkPrimary, setLinkPrimary] = useState<string>('')
  const [linkSecondaries, setLinkSecondaries] = useState<string[]>([])
  const [linkSaving, setLinkSaving] = useState(false)

  const fetchContents = async () => {
    try {
      const res = await fetch('/api/admin/contents', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '컨텐츠 목록 조회 실패')
      setContentMaster(data.items || [])
    } catch (e: unknown) {
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
    } catch (e: unknown) {
      const err = e as Error
      setError(err.message || '목록 조회 실패')
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
            devices: c.devices.map((d: SchoolDeviceItem) => (d.id === memoTarget.schoolDeviceId ? { ...d, memo: memoText } : d)),
          })),
        })),
      )

      setMemoModalOpen(false)
      setMemoTarget(null)
    } catch (e: unknown) {
      const err = e as Error
      alert(err.message || '메모 저장 실패')
    } finally {
      setMemoSaving(false)
    }
  }

  // ===== 연동 모달 함수 =====
  const handleOpenLinkModal = async (school: SchoolListItem) => {
    setLinkSchool(school)
    setLinkModalOpen(true)
    setLinkLoading(true)
    setLinkPrimary('')
    setLinkSecondaries([])
    try {
      const res = await fetch(`/api/admin/school-linking?school_id=${school.id}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '연동 정보 조회 실패')
      setLinkGroups(data.groups || [])
      setLinkAvailable(data.linkable_devices || [])
    } catch (e: unknown) {
      alert((e as Error).message || '연동 정보 조회 실패')
    } finally {
      setLinkLoading(false)
    }
  }

  const handleCreateLinkGroup = async () => {
    if (!linkPrimary) { alert('주 디바이스를 선택해주세요.'); return }
    if (linkSecondaries.length === 0) { alert('부 디바이스를 1개 이상 선택해주세요.'); return }
    setLinkSaving(true)
    try {
      const res = await fetch('/api/admin/school-linking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          primary_device_id: linkPrimary,
          secondary_device_ids: linkSecondaries,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '연동 그룹 생성 실패')
      // 새로고침
      if (linkSchool) handleOpenLinkModal(linkSchool)
    } catch (e: unknown) {
      alert((e as Error).message || '연동 그룹 생성 실패')
    } finally {
      setLinkSaving(false)
    }
  }

  const handleDeleteLinkGroup = async (groupId: string) => {
    if (!confirm('이 연동 그룹을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/admin/school-linking?group_id=${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '연동 그룹 삭제 실패')
      // 새로고침
      if (linkSchool) handleOpenLinkModal(linkSchool)
    } catch (e: unknown) {
      alert((e as Error).message || '연동 그룹 삭제 실패')
    }
  }

  const toggleSecondary = (id: string) => {
    setLinkSecondaries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assignments: ContentAssignment[] = (data.contents || []).map((c: any) => {
          // 각 디바이스별 수량 계산
          const quantities: { [id: string]: number } = {}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    } catch (e: unknown) {
      const err = e as Error
      alert(err.message || '삭제 실패')
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
    } catch (e: unknown) {
      const err = e as Error
      setFormError(err.message || '저장 실패')
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
          <div className="w-10 flex-shrink-0 flex items-center justify-center">
            {d.link_group_id && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                연동
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => openMemoModal(String(d.id), `${d.device_name} #${n}`, d.memo)}
            className="ml-2 px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-[11px]"
          >
            메모
          </button>
          {d.memo && (
            <span className="ml-2 text-[11px] text-gray-500 truncate max-w-[300px]" title={d.memo}>
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const themeKey = (c: any) => String(c?.id || c?.content_id || c?.name || '')

  const fallbackPalette = ['#DBEAFE', '#DCFCE7', '#FEF3C7', '#FFE4E6', '#EDE9FE', '#CFFAFE', '#ECFCCB', '#E0F2FE']

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveContentHex = (c: any) => {
    const v = String(c?.color_hex || '').trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
    // fallback: 컨텐츠별로 고정되게 해시 기반 선택
    return fallbackPalette[hashToIndex(themeKey(c), fallbackPalette.length)]
  }

  const borderFromHex = () => {
    // 아주 간단히 border는 고정 색으로 (UX: 대비 안정적)
    return '#CBD5E1' // slate-300
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderContentBadge = (c: any) => {
    const bg = resolveContentHex(c)
    return (
      <div
        className="inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-bold text-gray-900 shadow-sm"
        style={{ backgroundColor: bg, borderColor: borderFromHex() }}
      >
        {c.name}
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderContentDeviceCard = (c: any) => {
    const bg = resolveContentHex(c)
    return (
      <div key={c.id} className="rounded-md border p-2" style={{ backgroundColor: bg, borderColor: borderFromHex() }}>
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
                      {row.has_linkable && (
                        <button onClick={() => handleOpenLinkModal(row)} className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded">연동</button>
                      )}
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

      {/* 연동 모달 */}
      {linkModalOpen && linkSchool && (() => {
        // 컨텐츠별로 그룹핑 헬퍼
        const groupByContent = (devices: any[]) => {
          const map = new Map<string, { content_name: string; content_color_hex: string | null; items: any[] }>()
          devices.forEach((d: any) => {
            const key = d.content_name || '기타'
            if (!map.has(key)) map.set(key, { content_name: key, content_color_hex: d.content_color_hex, items: [] })
            map.get(key)!.items.push(d)
          })
          return Array.from(map.values())
        }
        const availableByContent = groupByContent(linkAvailable)

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* 헤더 */}
              <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">디바이스 연동 관리</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{linkSchool.name}</p>
                </div>
                <button onClick={() => { setLinkModalOpen(false); setLinkSchool(null); fetchList() }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors text-lg">&times;</button>
              </div>

              <div className="overflow-y-auto flex-1 px-6 py-5">
                {linkLoading ? (
                  <div className="py-16 text-center text-gray-400">불러오는 중...</div>
                ) : (
                  <div className="space-y-8">

                    {/* ── 섹션 1: 기존 연동 그룹 ── */}
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-indigo-500"></div>
                        <h3 className="text-sm font-bold text-gray-800">기존 연동 그룹</h3>
                        <span className="text-xs text-gray-400 ml-1">{linkGroups.length}개</span>
                      </div>

                      {linkGroups.length === 0 ? (
                        <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
                          <p className="text-sm text-gray-400">아직 연동 그룹이 없습니다.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {linkGroups.map((g: any) => (
                            <div key={g.group_id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                                <span className="text-xs text-gray-400 font-mono">그룹 {g.group_id.slice(0, 8)}</span>
                                <button
                                  onClick={() => handleDeleteLinkGroup(g.group_id)}
                                  className="text-xs px-3 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-600 transition-colors border border-red-100"
                                >삭제</button>
                              </div>
                              <div className="p-4 space-y-2">
                                {/* 주 디바이스 */}
                                {g.primary && (
                                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">주</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-semibold text-gray-900">{g.primary.device_name}</div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: g.primary.content_color_hex || '#6B7280' }}>{g.primary.content_name}</span>
                                        <span className="text-xs font-mono text-gray-400 tracking-wider">{g.primary.auth_key}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {/* 연결선 */}
                                {g.secondaries.length > 0 && (
                                  <div className="flex items-center gap-2 pl-6">
                                    <div className="w-px h-3 bg-gray-300"></div>
                                    <span className="text-[10px] text-gray-400">연동됨</span>
                                    <div className="flex-1 h-px bg-gray-200"></div>
                                  </div>
                                )}
                                {/* 부 디바이스들 */}
                                {g.secondaries.map((s: any) => (
                                  <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100 ml-6">
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-400 text-white text-xs font-bold flex items-center justify-center">부</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-semibold text-gray-900">{s.device_name}</div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: s.content_color_hex || '#6B7280' }}>{s.content_name}</span>
                                        <span className="text-xs font-mono text-gray-400 tracking-wider">{s.auth_key}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* ── 섹션 2: 새 연동 그룹 생성 ── */}
                    {linkAvailable.length >= 2 ? (
                      <section>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-5 rounded-full bg-purple-500"></div>
                          <h3 className="text-sm font-bold text-gray-800">새 연동 그룹 생성</h3>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">주 디바이스 1개와 부 디바이스를 선택하여 연동 그룹을 만드세요.</p>

                        {/* 컨텐츠별 그룹 */}
                        <div className="space-y-4">
                          {availableByContent.map((group) => (
                            <div key={group.content_name} className="rounded-xl border border-gray-200 overflow-hidden">
                              {/* 컨텐츠 헤더 */}
                              <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ backgroundColor: (group.content_color_hex || '#E5E7EB') + '20' }}>
                                <span
                                  className="inline-block px-2 py-0.5 rounded text-xs font-bold text-white shadow-sm"
                                  style={{ backgroundColor: group.content_color_hex || '#6B7280' }}
                                >{group.content_name}</span>
                                <span className="text-xs text-gray-400">{group.items.length}개 디바이스</span>
                              </div>

                              {/* 디바이스 목록 */}
                              <div className="divide-y divide-gray-50">
                                {group.items.map((d: any) => {
                                  const isPrimary = linkPrimary === d.id
                                  const isSecondary = linkSecondaries.includes(d.id)
                                  const isSelected = isPrimary || isSecondary

                                  return (
                                    <div
                                      key={d.id}
                                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${isPrimary ? 'bg-indigo-50' : isSecondary ? 'bg-purple-50' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                      {/* 역할 선택 버튼 */}
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isPrimary) {
                                              setLinkPrimary('')
                                            } else {
                                              setLinkPrimary(d.id)
                                              setLinkSecondaries((prev) => prev.filter((x) => x !== d.id))
                                            }
                                          }}
                                          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border-2 transition-all ${isPrimary
                                            ? 'bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-200'
                                            : 'bg-white text-gray-400 border-gray-300 hover:border-indigo-400 hover:text-indigo-400'
                                            }`}
                                          title="주 디바이스로 지정"
                                        >주</button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isPrimary) return // 주 선택 시 부 불가
                                            toggleSecondary(d.id)
                                          }}
                                          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border-2 transition-all ${isSecondary
                                            ? 'bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-200'
                                            : isPrimary
                                              ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                                              : 'bg-white text-gray-400 border-gray-300 hover:border-purple-400 hover:text-purple-400'
                                            }`}
                                          title="부 디바이스로 지정"
                                          disabled={isPrimary}
                                        >부</button>
                                      </div>

                                      {/* 디바이스 정보 */}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900">{d.device_name}</div>
                                        <div className="text-xs font-mono text-gray-400 mt-0.5 tracking-wider">{d.auth_key}</div>
                                      </div>

                                      {/* 선택 상태 뱃지 */}
                                      {isSelected && (
                                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${isPrimary ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
                                          }`}>
                                          {isPrimary ? '주 디바이스' : '부 디바이스'}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 선택 요약 & 생성 버튼 */}
                        <div className="mt-5 flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100">
                          <div className="text-xs text-gray-600">
                            {linkPrimary ? (
                              <span>주: <strong className="text-indigo-700">{linkAvailable.find((d: any) => d.id === linkPrimary)?.device_name}</strong></span>
                            ) : (
                              <span className="text-gray-400">주 디바이스를 선택하세요</span>
                            )}
                            {linkSecondaries.length > 0 && (
                              <span className="ml-3">부: <strong className="text-purple-700">{linkSecondaries.length}개</strong> 선택됨</span>
                            )}
                          </div>
                          <button
                            onClick={handleCreateLinkGroup}
                            disabled={linkSaving || !linkPrimary || linkSecondaries.length === 0}
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                          >
                            {linkSaving ? '생성 중...' : '연동 그룹 생성'}
                          </button>
                        </div>
                      </section>
                    ) : linkAvailable.length > 0 ? (
                      <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
                        <p className="text-sm text-gray-400">미연동 디바이스가 2개 이상이어야 새 그룹을 만들 수 있습니다.</p>
                      </div>
                    ) : linkGroups.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
                        <p className="text-sm text-gray-400">연동 가능한 디바이스가 없습니다.</p>
                      </div>
                    ) : null}

                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
