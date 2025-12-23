'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type SchoolDeviceInstance = {
  id: string
  device_id: string
  device_name: string
  device_icon_url?: string | null
  auth_key: string
  memo: string
  status: string | null
  created_at: string | null
  content_name: string | null
  content_color_hex?: string | null
}

type AssetItem = {
  name: string
  original_path: string
  thumb_path: string
  thumb_url: string | null
  full_url: string | null
  created_at?: string | null
  updated_at?: string | null
  metadata?: any
}

export default function SchoolSettingsPage() {
  const [devices, setDevices] = useState<SchoolDeviceInstance[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [assetsByDeviceId, setAssetsByDeviceId] = useState<Record<string, AssetItem[]>>({})
  const [loadingAssetsId, setLoadingAssetsId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [memoModalOpen, setMemoModalOpen] = useState(false)
  const [memoTarget, setMemoTarget] = useState<{ id: string; label: string } | null>(null)
  const [memoText, setMemoText] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)

  const loadDevices = async () => {
    setLoadingDevices(true)
    try {
      const res = await fetch('/api/school/school-devices', { credentials: 'include' })
      const data = await res.json()
      setDevices(Array.isArray(data.items) ? data.items : [])
    } catch {
      setDevices([])
    } finally {
      setLoadingDevices(false)
    }
  }

  const loadAssets = async (schoolDeviceId: string) => {
    setLoadingAssetsId(schoolDeviceId)
    try {
      const res = await fetch(`/api/school/device-assets?school_device_id=${encodeURIComponent(schoolDeviceId)}`, {
        credentials: 'include',
      })
      const data = await res.json()
      setAssetsByDeviceId((prev) => ({ ...prev, [schoolDeviceId]: Array.isArray(data.items) ? data.items : [] }))
    } catch {
      setAssetsByDeviceId((prev) => ({ ...prev, [schoolDeviceId]: [] }))
    } finally {
      setLoadingAssetsId(null)
    }
  }

  const uploadFiles = async (schoolDeviceId: string, files: File[]) => {
    if (!files || files.length === 0) return
    try {
      setUploadingId(schoolDeviceId)
      const form = new FormData()
      form.append('school_device_id', schoolDeviceId)
      files.forEach((f) => form.append('files', f))
      const res = await fetch('/api/school/device-assets', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '업로드 실패')
      await loadAssets(schoolDeviceId)
    } catch (err: any) {
      alert(err?.message || '업로드 실패')
    } finally {
      setUploadingId(null)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  const rows = useMemo(() => devices, [devices])
  const grouped = useMemo(() => {
    const map = new Map<string, { content_name: string; color_hex: string | null; items: SchoolDeviceInstance[] }>()
    for (const d of rows) {
      const contentName = d.content_name ? String(d.content_name) : '미분류'
      const key = contentName
      const existing = map.get(key)
      if (existing) {
        existing.items.push(d)
      } else {
        map.set(key, { content_name: contentName, color_hex: d.content_color_hex ?? null, items: [d] })
      }
    }
    return Array.from(map.values())
  }, [rows])

  const resolveHex = (hex: any) => {
    const v = String(hex || '').trim()
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
  }

  const openMemoModal = (id: string, label: string, currentMemo: string) => {
    setMemoTarget({ id, label })
    setMemoText(currentMemo || '')
    setMemoModalOpen(true)
  }

  const saveMemo = async () => {
    if (!memoTarget) return
    setMemoSaving(true)
    try {
      const res = await fetch(`/api/school/school-devices/${encodeURIComponent(memoTarget.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memo: memoText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '메모 저장 실패')

      setDevices((prev) => prev.map((d) => (d.id === memoTarget.id ? { ...d, memo: memoText } : d)))
      setMemoModalOpen(false)
      setMemoTarget(null)
    } catch (e: any) {
      alert(e.message || '메모 저장 실패')
    } finally {
      setMemoSaving(false)
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">디바이스 설정</h1>
      </div>

      <div className="bg-white/95 rounded-2xl shadow-xl overflow-hidden border border-white/40">
        {loadingDevices ? (
          <div className="px-4 py-6 text-center text-gray-500">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-500">배정된 디바이스가 없습니다.</div>
        ) : (
          <div className="p-4 space-y-6">
            {grouped.map(({ content_name, color_hex, items }) => (
              <div key={content_name} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-end gap-2">
                    <div className="inline-flex items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-extrabold text-gray-900 shadow-sm"
                        style={{
                          backgroundColor: resolveHex(color_hex) || undefined,
                          borderColor: resolveHex(color_hex) ? 'rgba(0,0,0,0.08)' : undefined,
                        }}
                      >
                        {content_name}
                      </span>
                      <span className="text-xs text-gray-500">({items.length})</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(() => {
                    // 관리자 화면 표시와 최대한 맞추기: 디바이스명 -> created_at -> id
                    const sortedItems = [...items].sort((a, b) => {
                      const nn = (a.device_name || '').localeCompare(b.device_name || '')
                      if (nn !== 0) return nn
                      const ad = a.created_at || ''
                      const bd = b.created_at || ''
                      if (ad !== bd) return ad.localeCompare(bd)
                      return String(a.id || '').localeCompare(String(b.id || ''))
                    })

                    const counter = new Map<string, number>()

                    return sortedItems.map((d) => {
                      const ord = (counter.get(d.device_name) || 0) + 1
                      counter.set(d.device_name, ord)

                    const expanded = expandedId === d.id
                    const assets = assetsByDeviceId[d.id] || []
                    const isLoadingAssets = loadingAssetsId === d.id
                    const isUploading = uploadingId === d.id
                    const isDragOver = dragOverId === d.id
                    const contentHex = resolveHex(d.content_color_hex)
                    const cardBg = contentHex || undefined
                    const cardBorder = contentHex ? 'rgba(0,0,0,0.08)' : undefined

                    return (
                      <div
                        key={d.id}
                        className="rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-sm hover:shadow-md transition-shadow"
                        style={{
                          backgroundColor: cardBg,
                          borderColor: cardBorder,
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {d.device_icon_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={d.device_icon_url}
                                  alt={`${d.device_name} 아이콘`}
                                  className="h-9 w-9 rounded-xl object-cover border border-gray-200"
                                />
                              ) : (
                                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 shadow-sm" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">
                                  {d.device_name} <span className="text-gray-600 font-semibold">#{ord}</span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2">
                                  {d.memo ? (
                                    <div className="text-xs text-gray-600 truncate" title={d.memo}>
                                      {d.memo}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-500">메모 없음</div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openMemoModal(d.id, `${d.device_name} #${ord}`, d.memo)}
                                    className="px-2 py-0.5 rounded border border-gray-300 bg-white/80 text-gray-700 hover:bg-white text-[11px] shadow-sm"
                                  >
                                    메모
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                const next = expanded ? null : d.id
                                setExpandedId(next)
                                if (!expanded) await loadAssets(d.id)
                              }}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm"
                            >
                              {expanded ? '닫기' : '이미지 관리'}
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="mt-5 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-gray-900">이미지</div>
                            </div>

                            {isLoadingAssets ? (
                              <div className="py-4 text-center text-sm text-gray-500">불러오는 중...</div>
                            ) : assets.length === 0 ? (
                              <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                                아직 업로드된 이미지가 없습니다.
                              </div>
                            ) : (
                              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {assets.map((a) => (
                                  <div key={a.original_path} className="group relative rounded border border-gray-200 bg-white overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (a.full_url || a.thumb_url) setPreviewUrl(a.full_url || a.thumb_url)
                                      }}
                                      className="block w-full"
                                      title={a.name}
                                    >
                                      {a.thumb_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={a.thumb_url}
                                          alt={a.name}
                                          className="h-24 w-full object-cover"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="h-24 w-full flex items-center justify-center text-xs text-gray-400">미리보기 불가</div>
                                      )}
                                    </button>

                                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-1.5 bg-white/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity">
                                      <div className="text-[11px] text-gray-600 truncate min-w-0" title={a.name}>{a.name}</div>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!confirm('해당 파일을 삭제하시겠습니까?')) return
                                          try {
                                            const res = await fetch(
                                              `/api/school/device-assets?school_device_id=${encodeURIComponent(d.id)}&original_path=${encodeURIComponent(a.original_path)}`,
                                              { method: 'DELETE', credentials: 'include' },
                                            )
                                            const data = await res.json().catch(() => ({}))
                                            if (!res.ok) throw new Error(data.error || '삭제 실패')
                                            await loadAssets(d.id)
                                          } catch (err: any) {
                                            alert(err?.message || '삭제 실패')
                                          }
                                        }}
                                        className="px-2 py-0.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] shrink-0"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Dropzone + 업로드 버튼 (기본 file input UI 제거) */}
                            <div
                              className={[
                                'mt-4 rounded-2xl border border-dashed p-4',
                                isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white',
                              ].join(' ')}
                              onDragOver={(e) => {
                                e.preventDefault()
                                setDragOverId(d.id)
                              }}
                              onDragLeave={() => setDragOverId((cur) => (cur === d.id ? null : cur))}
                              onDrop={async (e) => {
                                e.preventDefault()
                                setDragOverId(null)
                                const fileList = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'))
                                await uploadFiles(d.id, fileList)
                              }}
                            >
                              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="text-sm text-gray-700">
                                  <div className="font-semibold">이미지를 여기로 드래그해서 업로드</div>
                                  <div className="text-xs text-gray-500 mt-1">또는 버튼을 눌러 파일을 선택하세요.</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    ref={(el) => {
                                      fileInputRefs.current[d.id] = el
                                    }}
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    disabled={isUploading}
                                    onChange={async (e) => {
                                      const fileList = Array.from(e.target.files || [])
                                      await uploadFiles(d.id, fileList)
                                      // 같은 파일 다시 선택 가능하게 리셋
                                      e.target.value = ''
                                    }}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    disabled={isUploading}
                                    onClick={() => fileInputRefs.current[d.id]?.click()}
                                    className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold shadow-sm disabled:opacity-60"
                                  >
                                    {isUploading ? '업로드 중…' : '이미지 업로드'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
          role="button"
          tabIndex={-1}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -top-10 right-0 px-3 py-1 rounded bg-white/90 text-gray-900 text-sm"
              onClick={() => setPreviewUrl(null)}
            >
              닫기
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="미리보기" className="w-full max-h-[80vh] object-contain rounded" />
          </div>
        </div>
      )}

      {/* 메모 모달 */}
      {memoModalOpen && memoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-gray-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">메모 - {memoTarget.label}</h3>
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
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
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
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={memoSaving}
                onClick={saveMemo}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


