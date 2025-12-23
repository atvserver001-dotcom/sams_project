'use client'

import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface DeviceRow { id: string; device_name: string; sort_order?: number | null; icon_url?: string | null; icon_path?: string | null }
interface ContentRow { id: string; name: string; description?: string; color_hex?: string; devices: { id: string; name: string }[] }

export default function AdminDevicesPage() {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<'content' | 'device'>('content')
  
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [contents, setContents] = useState<ContentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false)
  const [isContentModalOpen, setIsContentModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [deviceName, setDeviceName] = useState('')
  const [deviceIconFile, setDeviceIconFile] = useState<File | null>(null)
  const [deviceIconPreview, setDeviceIconPreview] = useState<string>('')
  
  const [contentName, setContentName] = useState('')
  const [contentDesc, setContentDesc] = useState('')
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])
  const [contentColorHex, setContentColorHex] = useState<string>('#DBEAFE')
  
  const [formError, setFormError] = useState('')

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [devRes, contRes] = await Promise.all([
        fetch('/api/admin/devices', { credentials: 'include' }),
        fetch('/api/admin/contents', { credentials: 'include' })
      ])
      const devData = await devRes.json()
      const contData = await contRes.json()
      
      if (!devRes.ok) throw new Error(devData.error || '디바이스 조회 실패')
      if (!contRes.ok) throw new Error(contData.error || '컨텐츠 조회 실패')
      
      setDevices(devData.items || [])
      setContents(contData.items || [])
    } catch (e: any) {
      setError(e.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) fetchAll()
  }, [isAdmin])

  // --- Device Management ---
  const openDeviceCreate = () => {
    setEditingId(null)
    setDeviceName('')
    setDeviceIconFile(null)
    setDeviceIconPreview('')
    setFormError('')
    setIsDeviceModalOpen(true)
  }

  const openDeviceEdit = (row: DeviceRow) => {
    setEditingId(row.id)
    setDeviceName(row.device_name)
    setDeviceIconFile(null)
    setDeviceIconPreview(row.icon_url || '')
    setFormError('')
    setIsDeviceModalOpen(true)
  }

  const handleDeviceDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? (컨텐츠나 학교에 할당된 경우 실패할 수 있습니다)')) return
    try {
      const res = await fetch(`/api/admin/devices/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '삭제 실패')
      }
      await fetchAll()
    } catch (e: any) {
      alert(e.message || '삭제 실패')
    }
  }

  const handleDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    try {
      const name = deviceName.trim()
      if (!name) return setFormError('디바이스 이름을 입력해주세요.')
      
      const res = await fetch(editingId ? `/api/admin/devices/${editingId}` : '/api/admin/devices', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ device_name: name }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '저장 실패')
      }
      const data = await res.json()
      const deviceId = editingId || data?.item?.id

      // 아이콘 업로드(선택된 경우)
      if (deviceId && deviceIconFile) {
        const form = new FormData()
        form.append('file', deviceIconFile)
        const upRes = await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/icon`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
        const upData = await upRes.json().catch(() => ({}))
        if (!upRes.ok) throw new Error(upData.error || '아이콘 업로드 실패')
      }
      setIsDeviceModalOpen(false)
      await fetchAll()
    } catch (e: any) {
      setFormError(e.message || '저장 실패')
    }
  }

  // --- Content Management ---
  const openContentCreate = () => {
    setEditingId(null)
    setContentName('')
    setContentDesc('')
    setSelectedDeviceIds([])
    setContentColorHex('#DBEAFE')
    setFormError('')
    setIsContentModalOpen(true)
  }

  const openContentEdit = (row: ContentRow) => {
    setEditingId(row.id)
    setContentName(row.name)
    setContentDesc(row.description || '')
    setSelectedDeviceIds(row.devices.map(d => d.id))
    setContentColorHex(row.color_hex || '#DBEAFE')
    setFormError('')
    setIsContentModalOpen(true)
  }

  const handleContentDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? (학교에 할당된 경우 실패할 수 있습니다)')) return
    try {
      const res = await fetch(`/api/admin/contents/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '삭제 실패')
      }
      await fetchAll()
    } catch (e: any) {
      alert(e.message || '삭제 실패')
    }
  }

  const handleContentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    try {
      const name = contentName.trim()
      if (!name) return setFormError('컨텐츠 이름을 입력해주세요.')
      
      const res = await fetch(editingId ? `/api/admin/contents/${editingId}` : '/api/admin/contents', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description: contentDesc, device_ids: selectedDeviceIds, color_hex: contentColorHex }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '저장 실패')
      }
      setIsContentModalOpen(false)
      await fetchAll()
    } catch (e: any) {
      setFormError(e.message || '저장 실패')
    }
  }

  const persistDeviceOrder = async (newItems: DeviceRow[]) => {
    try {
      const order = newItems.map((x) => x.id)
      const res = await fetch('/api/admin/devices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order }),
      })
      if (!res.ok) throw new Error('정렬 저장 실패')
    } catch (e) {
      console.error(e)
      fetchAll()
    }
  }

  const moveDeviceUp = (id: string) => {
    const idx = devices.findIndex((x) => x.id === id)
    if (idx <= 0) return
    const next = [...devices]
    const tmp = next[idx - 1]
    next[idx - 1] = next[idx]
    next[idx] = tmp
    setDevices(next)
    persistDeviceOrder(next)
  }

  const moveDeviceDown = (id: string) => {
    const idx = devices.findIndex((x) => x.id === id)
    if (idx === -1 || idx >= devices.length - 1) return
    const next = [...devices]
    const tmp = next[idx + 1]
    next[idx + 1] = next[idx]
    next[idx] = tmp
    setDevices(next)
    persistDeviceOrder(next)
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">디바이스 관리</h1>
        <div className="flex gap-2">
          {activeTab === 'content' ? (
            <button onClick={openContentCreate} className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-md text-sm font-medium border border-white/30">컨텐츠 추가</button>
          ) : (
            <button onClick={openDeviceCreate} className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-md text-sm font-medium border border-white/30">디바이스 추가</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/20">
        <button
          onClick={() => setActiveTab('content')}
          className={`px-6 py-3 text-sm font-medium ${activeTab === 'content' ? 'border-b-2 border-yellow-500 text-yellow-500' : 'text-gray-400 hover:text-white'}`}
        >
          컨텐츠 관리
        </button>
        <button
          onClick={() => setActiveTab('device')}
          className={`px-6 py-3 text-sm font-medium ${activeTab === 'device' ? 'border-b-2 border-yellow-500 text-yellow-500' : 'text-gray-400 hover:text-white'}`}
        >
          디바이스 관리
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white/95 rounded-lg shadow overflow-hidden">
        {activeTab === 'content' ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">컨텐츠 이름</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">색상</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">설명</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">소속 디바이스</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">불러오는 중...</td></tr>
              ) : contents.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">데이터가 없습니다.</td></tr>
              ) : (
                contents.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-5 w-5 rounded border border-gray-300"
                          style={{ backgroundColor: row.color_hex || '#DBEAFE' }}
                          title={row.color_hex || '#DBEAFE'}
                        />
                        
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{row.description || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex flex-wrap gap-1">
                        {row.devices.map(d => (
                          <span key={d.id} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">{d.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => openContentEdit(row)} className="text-indigo-600 hover:text-indigo-900 mr-3">수정</button>
                      <button onClick={() => handleContentDelete(row.id)} className="text-red-600 hover:text-red-900">삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
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
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">불러오는 중...</td></tr>
              ) : devices.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">데이터가 없습니다.</td></tr>
              ) : (
                devices.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{idx + 1}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-3">
                        {row.icon_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.icon_url}
                            alt={`${row.device_name} 아이콘`}
                            className="h-8 w-8 rounded-xl object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-xl bg-gray-100 border border-gray-200" />
                        )}
                        <span>{row.device_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => moveDeviceUp(row.id)} disabled={idx === 0} className="px-2 py-1 rounded border bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-30">▲</button>
                        <button onClick={() => moveDeviceDown(row.id)} disabled={idx === devices.length - 1} className="px-2 py-1 rounded border bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-30">▼</button>
                        <button onClick={() => openDeviceEdit(row)} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">수정</button>
                        <button onClick={() => handleDeviceDelete(row.id)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Device Modal */}
      {isDeviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? '디바이스 수정' : '디바이스 추가'}</h2>
            <form className="space-y-4" onSubmit={handleDeviceSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">디바이스 이름</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">아이콘 이미지</label>
                <div className="flex items-center gap-3">
                  {deviceIconPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={deviceIconPreview} alt="아이콘 미리보기" className="h-12 w-12 rounded-xl object-cover border border-gray-200" />
                  ) : (
                    <div className="h-12 w-12 rounded-xl bg-gray-100 border border-gray-200" />
                  )}
                  <label className="inline-flex items-center">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null
                        setDeviceIconFile(f)
                        if (f) {
                          const url = URL.createObjectURL(f)
                          setDeviceIconPreview(url)
                        }
                      }}
                    />
                    <span className="px-3 py-2 rounded bg-gray-900 text-white text-sm font-medium cursor-pointer hover:bg-gray-800">
                      아이콘 선택
                    </span>
                  </label>
                  {deviceIconPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeviceIconFile(null)
                        setDeviceIconPreview('')
                      }}
                      className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
                    >
                      제거
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">권장: 정사각형 PNG/JPG (예: 256×256)</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsDeviceModalOpen(false)} className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500">취소</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white">저장</button>
              </div>
              {formError && <p className="text-sm text-red-600 pt-2">{formError}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Content Modal */}
      {isContentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? '컨텐츠 수정' : '컨텐츠 추가'}</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">색상</span>
                <input
                  type="color"
                  className="h-8 w-10 border border-gray-300 rounded"
                  value={contentColorHex}
                  onChange={(e) => setContentColorHex(e.target.value)}
                  title="컨텐츠 색상"
                />
                <input
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 font-mono"
                  value={contentColorHex}
                  onChange={(e) => setContentColorHex(e.target.value)}
                  placeholder="#RRGGBB"
                />
              </div>
            </div>
            <form className="space-y-4" onSubmit={handleContentSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">컨텐츠 이름</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900" value={contentName} onChange={(e) => setContentName(e.target.value)} placeholder="예: 운동기록관리" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                <textarea className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900" value={contentDesc} onChange={(e) => setContentDesc(e.target.value)} rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">디바이스 선택 (복수 선택 가능)</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded p-3">
                  {devices.map(d => (
                    <label key={d.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedDeviceIds.includes(d.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedDeviceIds(prev => [...prev, d.id])
                          else setSelectedDeviceIds(prev => prev.filter(id => id !== d.id))
                        }}
                      />
                      {d.device_name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsContentModalOpen(false)} className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500">취소</button>
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
