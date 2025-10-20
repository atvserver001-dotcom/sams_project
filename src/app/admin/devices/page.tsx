'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface DeviceRow { id: string; device_name: string; sort_order?: number | null }

export default function AdminDevicesPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [formError, setFormError] = useState('')

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/devices', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '목록 조회 실패')
      setItems((data.items || []) as DeviceRow[])
    } catch (e: any) {
      setError(e.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) fetchList()
  }, [isAdmin])

  const openCreate = () => {
    setEditingId(null)
    setDeviceName('')
    setFormError('')
    setIsOpen(true)
  }

  const openEdit = (row: DeviceRow) => {
    setEditingId(row.id)
    setDeviceName(row.device_name)
    setFormError('')
    setIsOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? (학교에 할당된 경우 실패할 수 있습니다)')) return
    try {
      const res = await fetch(`/api/admin/devices/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      await fetchList()
    } catch (e: any) {
      alert(e.message || '삭제 실패')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    try {
      const name = deviceName.trim()
      if (!name) {
        setFormError('디바이스 이름을 입력해주세요.')
        return
      }
      const res = await fetch(editingId ? `/api/admin/devices/${editingId}` : '/api/admin/devices', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ device_name: name }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '저장 실패')
        return
      }
      setIsOpen(false)
      if (editingId) {
        // 수정 시에는 목록을 재조회해 일관성 유지
        await fetchList()
      } else {
        // 생성 시에는 새 항목을 리스트의 최하단에 추가
        setItems((prev) => [...prev, (data.item as DeviceRow)])
      }
    } catch (e: any) {
      setFormError(e.message || '저장 실패')
    }
  }

  const rows = useMemo(() => items.map((item, index) => ({ index: index + 1, ...item })), [items])

  const persistOrder = async (newItems: DeviceRow[]) => {
    try {
      const order = newItems.map((x) => x.id)
      const res = await fetch('/api/admin/devices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '정렬 저장 실패')
      }
    } catch (e) {
      console.error(e)
      // 실패 시 목록 재조회로 복구
      fetchList()
    }
  }

  const moveUp = (id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === id)
      if (idx <= 0) return prev
      const next = [...prev]
      const tmp = next[idx - 1]
      next[idx - 1] = next[idx]
      next[idx] = tmp
      persistOrder(next)
      return next
    })
  }

  const moveDown = (id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === id)
      if (idx === -1 || idx >= prev.length - 1) return prev
      const next = [...prev]
      const tmp = next[idx + 1]
      next[idx + 1] = next[idx]
      next[idx] = tmp
      persistOrder(next)
      return next
    })
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">디바이스 관리</h1>
        <button onClick={openCreate} className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-md text-sm font-medium border border-white/30">추가</button>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">순서</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">디바이스 이름</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">불러오는 중...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">데이터가 없습니다.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.index}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.device_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => moveUp(row.id)}
                        disabled={row.index === 1}
                        className={`px-2 py-1 rounded border ${row.index === 1 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
                        title="위로"
                      >▲</button>
                      <button
                        onClick={() => moveDown(row.id)}
                        disabled={row.index === rows.length}
                        className={`px-2 py-1 rounded border ${row.index === rows.length ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
                        title="아래로"
                      >▼</button>
                      <button onClick={() => openEdit(row)} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">수정</button>
                      <button onClick={() => handleDelete(row.id)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded">삭제</button>
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? '디바이스 수정' : '디바이스 추가'}</h2>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">디바이스 이름</label>
                <input
                  className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500">취소</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white">저장</button>
              </div>
              {formError && <p className="text-sm text-red-600 pt-2">{formError}</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


