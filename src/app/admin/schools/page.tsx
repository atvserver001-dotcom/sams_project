'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface SchoolDeviceItem { device_name: string; period: string }
interface DeviceAssignment { device_id: string; device_name?: string; start_date: string | null; end_date: string | null; limited_period: boolean }
interface SchoolListItem {
  group_no: string
  name: string
  school_type: 1 | 2 | 3
  recognition_key?: string
  devices: SchoolDeviceItem[]
}

export default function SchoolsPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<SchoolListItem[]>([])
  const [loading, setLoading] = useState(true)
  // 페이징 제거
  const [error, setError] = useState<string>('')

  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ group_no: string; name: string; school_type: 1 | 2 | 3; device_ids: string[] }>({
    group_no: '',
    name: '',
    school_type: 1,
    device_ids: [],
  })
  const [formError, setFormError] = useState<string>('')

  const [deviceMaster, setDeviceMaster] = useState<{ id: string; device_name: string }[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [deviceAssignments, setDeviceAssignments] = useState<DeviceAssignment[]>([])

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/admin/devices', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '디바이스 목록 조회 실패')
      setDeviceMaster(data.items || [])
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

  useEffect(() => {
    if (isAdmin) {
      fetchList()
      fetchDevices()
    }
  }, [isAdmin])

  const handleOpenCreate = () => {
    setModalLoading(true)
    setEditingId(null)
    setForm({ group_no: '', name: '', school_type: 1, device_ids: [] })
    setFormError('')
    setDeviceAssignments([])
    setIsOpen(true)
    // 초기화 직후 짧은 로딩으로 이전 UI 깜빡임 방지
    setModalLoading(false)
  }

  const handleOpenEdit = async (row: SchoolListItem) => {
    setModalLoading(true)
    setEditingId(row.group_no)
    setForm({ group_no: row.group_no, name: row.name, school_type: 1, device_ids: [] })
    setFormError('')
    setDeviceAssignments([])
    setIsOpen(true)
    try {
      const res = await fetch(`/api/admin/schools/${row.group_no}`, { credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        const assignments: DeviceAssignment[] = (data.devices || []).map((d: any) => ({
          device_id: d.device_id,
          device_name: d.device_name,
          start_date: d.start_date || null,
          end_date: d.end_date || null,
          limited_period: !!d.limited_period,
        }))
        setDeviceAssignments(assignments)
        setForm((s) => ({ ...s, school_type: (data.school_type as any) || 1, device_ids: assignments.map(a => a.device_id) }))
      }
    } catch {}
    setModalLoading(false)
  }

  const handleDelete = async (groupNo: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/admin/schools/${groupNo}`, { method: 'DELETE', credentials: 'include' })
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
      // 클라이언트 유효성: 그룹번호 4자리 숫자
      if (!/^\d{4}$/.test(form.group_no)) {
        setFormError('그룹번호는 숫자 4자리여야 합니다.')
        return
      }
      // 기간 검증: 제한 있는 항목은 시작일 <= 종료일이어야 함
      for (const a of deviceAssignments) {
        if (a.limited_period && a.start_date && a.end_date) {
          if (a.start_date > a.end_date) {
            const name = a.device_name || deviceMaster.find(m => m.id === a.device_id)?.device_name || a.device_id
            setFormError(`기간 오류: "${name}"의 시작일이 종료일 이후입니다.`)
            return
          }
        }
      }
      const payload: any = { group_no: form.group_no, name: form.name, school_type: form.school_type }
      const assignments = (deviceAssignments && deviceAssignments.length > 0)
        ? deviceAssignments
        : (form.device_ids || []).map((id) => ({ device_id: id, start_date: null, end_date: null, limited_period: false }))
      payload.device_assignments = assignments.map((a) => ({
        device_id: a.device_id,
        start_date: a.limited_period ? (a.start_date || null) : null,
        end_date: a.limited_period ? (a.end_date || null) : null,
        limited_period: !!a.limited_period,
      }))
      const res = await fetch(editingId ? `/api/admin/schools/${editingId}` : '/api/admin/schools', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '저장 실패')
        return
      }
      setIsOpen(false)
      await fetchList()
    } catch (e: any) {
      setFormError(e.message || '저장 실패')
    }
  }

  const rows = useMemo(() => items.map((item, index) => ({ index: index + 1, ...item })), [items])

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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">그룹번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">학교 이름 / 종류</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">디바이스</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">기간 / 인식키</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">불러오는 중...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">데이터가 없습니다.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.group_no}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.index}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.group_no}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex flex-col">
                      <span>{row.name}</span>
                      <span className="text-gray-500 text-xs">
                        {row.school_type === 1 ? '초등학교' : row.school_type === 2 ? '중학교' : '고등학교'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 align-top">
                    {row.devices && row.devices.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {row.devices.map((d, i) => (
                          <span key={i} className="text-gray-900">{d.device_name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 align-top">
                    {row.devices && row.devices.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {row.devices.map((d, i) => (
                          <span key={i} className={d.period === '제한없음' ? 'text-red-600' : 'text-gray-900'}>{d.period}</span>
                        ))}
                        {row.recognition_key && (
                          <span className="text-[12px] text-gray-500">인식키: {row.recognition_key}</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-500">-</span>
                        {row.recognition_key && (
                          <span className="text-[12px] text-gray-500">인식키: {row.recognition_key}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => handleOpenEdit(row)} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">수정</button>
                      <button onClick={() => handleDelete(row.group_no)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded">삭제</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>


      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? '학교 수정' : '학교 생성'}</h2>
            {modalLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-700">
                <div className="h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-3" />
                <div className="text-sm">불러오는 중...</div>
              </div>
            ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">그룹번호</label>
                <input
                  className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                  value={form.group_no}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setForm((s) => ({ ...s, group_no: digits }))
                    if (formError && /^\d{4}$/.test(digits)) setFormError('')
                  }}
                  required
                  disabled={false}
                  placeholder="4자리 숫자"
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  aria-invalid={!!formError}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">학교 이름</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">학교 종류</label>
                <select
                  className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                  value={form.school_type}
                  onChange={(e) => setForm((s) => ({ ...s, school_type: Number(e.target.value) as 1|2|3 }))}
                  required
                >
                  <option value={1}>초등학교</option>
                  <option value={2}>중학교</option>
                  <option value={3}>고등학교</option>
                </select>
              </div>
              {/* 디바이스 선택 */}
              (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">디바이스 선택</label>
                  <div className="max-h-48 overflow-auto border border-gray-200 rounded p-2">
                    {deviceMaster.length === 0 ? (
                      <div className="text-sm text-gray-500 px-1 py-2">디바이스가 없습니다.</div>
                    ) : (
                      deviceMaster.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 py-1 px-1 text-gray-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={form.device_ids.includes(d.id)}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setForm((s) => ({
                                ...s,
                                device_ids: checked
                                  ? Array.from(new Set([...(s.device_ids || []), d.id]))
                                  : (s.device_ids || []).filter((x) => x !== d.id)
                              }))
                              setDeviceAssignments((prev) => {
                                if (checked) {
                                  if (prev.some((x) => x.device_id === d.id)) return prev
                                  return [...prev, { device_id: d.id, device_name: d.device_name, start_date: null, end_date: null, limited_period: false }]
                                }
                                return prev.filter((x) => x.device_id !== d.id)
                              })
                            }}
                          />
                          <span className="text-sm">{d.device_name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )
              {/* 선택된 디바이스 기간/제한 설정 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">선택된 디바이스 설정</label>
                {deviceAssignments.length === 0 ? (
                  <div className="text-sm text-gray-500">선택된 디바이스가 없습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {deviceAssignments.map((a, idx) => (
                      <div key={a.device_id} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-center">
                        <div className="col-span-2 text-sm text-gray-900 truncate">{a.device_name || deviceMaster.find(m => m.id === a.device_id)?.device_name || a.device_id}</div>
                        <div className="col-span-2">
                          <input
                            type="date"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] text-gray-900"
                            value={a.start_date || ''}
                            onChange={(e) => {
                              const v = e.target.value || null
                              setDeviceAssignments((prev) => prev.map((x, i) => i === idx ? { ...x, start_date: v } : x))
                            }}
                            disabled={!a.limited_period}
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="date"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] text-gray-900"
                            value={a.end_date || ''}
                            onChange={(e) => {
                              const v = e.target.value || null
                              setDeviceAssignments((prev) => prev.map((x, i) => i === idx ? { ...x, end_date: v } : x))
                            }}
                            disabled={!a.limited_period}
                          />
                        </div>
                        <label className="col-span-1 inline-flex items-center gap-2 text-[12px] text-gray-900">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!a.limited_period}
                            onChange={(e) => {
                              const unlimited = e.target.checked
                              setDeviceAssignments((prev) => prev.map((x, i) => {
                                if (i !== idx) return x
                                return {
                                  ...x,
                                  limited_period: !unlimited,
                                  start_date: unlimited ? null : x.start_date,
                                  end_date: unlimited ? null : x.end_date,
                                }
                              }))
                            }}
                          />
                          <span>무제한</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500">취소</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white">저장</button>
              </div>
              {formError && (
                <p className="text-sm text-red-600 pt-2">{formError}</p>
              )}
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


