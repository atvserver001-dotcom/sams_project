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

type CustomBlockBase = {
  id: string
  type: 'text' | 'image'
  subtitle: string
  body: string
}

type CustomTextBlock = CustomBlockBase & {
  type: 'text'
}

type CustomImageBlock = CustomBlockBase & {
  type: 'image'
  file: File | null
  previewUrl: string | null
}

type CustomBlock = CustomTextBlock | CustomImageBlock

type SettingsPage = {
  id: string
  kind: 'custom' | 'images'
  blocks: CustomBlock[]
}

export default function SchoolSettingsPage() {
  const [devices, setDevices] = useState<SchoolDeviceInstance[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)

  const [assetsByDeviceId, setAssetsByDeviceId] = useState<Record<string, AssetItem[]>>({})
  const [loadingAssetsId, setLoadingAssetsId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settingsTarget, setSettingsTarget] = useState<{ id: string; label: string } | null>(null)

  const [pagesByDeviceId, setPagesByDeviceId] = useState<Record<string, SettingsPage[]>>({})
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [customImageDragOverBlockId, setCustomImageDragOverBlockId] = useState<string | null>(null)
  const [expandedImageBlocks, setExpandedImageBlocks] = useState<Record<string, boolean>>({})
  const customImageFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

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

  // 커스텀 이미지 블록 미리보기 URL 정리
  useEffect(() => {
    return () => {
      for (const pages of Object.values(pagesByDeviceId)) {
        for (const p of pages) {
          for (const b of p.blocks) {
            if (b.type === 'image' && b.previewUrl) URL.revokeObjectURL(b.previewUrl)
          }
        }
      }
    }
  }, [pagesByDeviceId])

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

  const openSettingsModal = async (id: string, label: string) => {
    setSettingsTarget({ id, label })
    setActivePageId(pagesByDeviceId[id]?.[0]?.id ?? null)
    setSettingsModalOpen(true)
  }

  const closeSettingsModal = () => {
    setSettingsModalOpen(false)
    setSettingsTarget(null)
    setActivePageId(null)
    setCustomImageDragOverBlockId(null)
    setExpandedImageBlocks({})
  }

  const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`

  const ensurePages = (schoolDeviceId: string) => {
    setPagesByDeviceId((prev) => (prev[schoolDeviceId] ? prev : { ...prev, [schoolDeviceId]: [] }))
  }

  const addSettingsPage = async (schoolDeviceId: string, kind: SettingsPage['kind']) => {
    const nextId = makeId()
    let created = false

    setPagesByDeviceId((prev) => {
      const cur = prev[schoolDeviceId] || []
      if (cur.length >= 8) return prev
      created = true
      const next: SettingsPage = { id: nextId, kind, blocks: [] }
      return { ...prev, [schoolDeviceId]: [...cur, next] }
    })

    // state 업데이트가 비동기라 "created" 플래그는 베스트에포트. UI만 먼저라 안전하게 처리.
    if (created) {
      setActivePageId(nextId)
      if (kind === 'images') await loadAssets(schoolDeviceId)
    }
  }

  const addTextBlock = (schoolDeviceId: string, pageId: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          if (p.kind !== 'custom') return p
          if (p.blocks.length >= 4) return p
          const next: CustomTextBlock = { id: makeId(), type: 'text', subtitle: '', body: '' }
          return { ...p, blocks: [...p.blocks, next] }
        }),
      }
    })
  }

  const addImageBlock = (schoolDeviceId: string, pageId: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          if (p.kind !== 'custom') return p
          if (p.blocks.length >= 4) return p
          const next: CustomImageBlock = { id: makeId(), type: 'image', subtitle: '', body: '', file: null, previewUrl: null }
          return { ...p, blocks: [...p.blocks, next] }
        }),
      }
    })
  }

  const removeBlock = (schoolDeviceId: string, pageId: string, blockId: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          const target = p.blocks.find((b) => b.id === blockId)
          if (target?.type === 'image' && target.previewUrl) URL.revokeObjectURL(target.previewUrl)
          return { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) }
        }),
      }
    })
  }

  const updateBlock = (schoolDeviceId: string, pageId: string, blockId: string, patch: Partial<CustomBlock>) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          return {
            ...p,
            blocks: p.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as CustomBlock) : b)),
          }
        }),
      }
    })
  }

  const attachImageToBlock = (schoolDeviceId: string, pageId: string, blockId: string, file: File | null) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          return {
            ...p,
            blocks: p.blocks.map((b) => {
              if (b.id !== blockId) return b
              if (b.type !== 'image') return b
              if (b.previewUrl) URL.revokeObjectURL(b.previewUrl)
              const nextPreview = file ? URL.createObjectURL(file) : null
              return { ...b, file, previewUrl: nextPreview }
            }),
          }
        }),
      }
    })
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
                                ensurePages(d.id)
                                await openSettingsModal(d.id, `${d.device_name} #${ord}`)
                              }}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm"
                            >
                              설정
                            </button>
                          </div>
                        </div>
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

      {/* 설정 모달 */}
      {settingsModalOpen && settingsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden text-gray-900 max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              {(() => {
                const pages = pagesByDeviceId[settingsTarget.id] || []
                const pageFull = pages.length >= 8
                return (
                  <>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-lg font-semibold truncate">설정 - {settingsTarget.label}</div>
                        <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
                          {pages.length}/8
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">UI만 먼저 구성되어 있습니다.</div>
                    </div>

                    <div className="shrink-0 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={pageFull}
                        onClick={() => addSettingsPage(settingsTarget.id, 'custom')}
                        className={[
                          'px-3 py-1.5 rounded-xl text-sm font-semibold border shadow-sm',
                          pageFull
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700',
                        ].join(' ')}
                      >
                        커스텀페이지 추가
                      </button>
                      <button
                        type="button"
                        disabled={pageFull}
                        onClick={() => addSettingsPage(settingsTarget.id, 'images')}
                        className={[
                          'px-3 py-1.5 rounded-xl text-sm font-semibold border shadow-sm',
                          pageFull
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600',
                        ].join(' ')}
                      >
                        이미지 추가
                      </button>
                      <button
                        type="button"
                        onClick={closeSettingsModal}
                        className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 text-sm font-semibold"
                      >
                        닫기
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="px-6 pb-4 pt-0 overflow-y-auto">
              {(() => {
                const deviceId = settingsTarget.id
                const pages = pagesByDeviceId[deviceId] || []
                const pageFull = pages.length >= 8
                const active = pages.find((p) => p.id === activePageId) || pages[0] || null
                const activeBlocks = active?.kind === 'custom' ? active.blocks : []
                const blockFull = active?.kind === 'custom' ? activeBlocks.length >= 4 : true

                return (
                  <div className="space-y-4">
                    {/* 페이지 탭 */}
                    {pages.length > 0 && (
                      <div className="sticky top-0 z-30 -mx-6 px-6 pt-0 pb-3 bg-white/95 backdrop-blur border-b border-gray-200">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2 shadow-sm">
                          <div className="flex flex-wrap items-center gap-2">
                        {pages.map((p, idx) => {
                          const selected = (active?.id || null) === p.id
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={async () => {
                                setActivePageId(p.id)
                                if (p.kind === 'images') await loadAssets(deviceId)
                              }}
                              className={[
                                'shrink-0 px-3 py-2 rounded-2xl text-sm font-semibold border flex items-center gap-2 shadow-sm',
                                selected
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : 'bg-white text-gray-800 border-gray-200 hover:bg-white',
                              ].join(' ')}
                            >
                              <span
                                className={[
                                  'inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-extrabold',
                                  selected ? 'bg-white/15 text-white' : 'bg-gray-900 text-white',
                                ].join(' ')}
                              >
                                {idx + 1}
                              </span>
                              <span>{idx + 1}페이지</span>
                              <span
                                className={[
                                  'text-[11px] px-2 py-0.5 rounded-full border',
                                  p.kind === 'custom'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200',
                                ].join(' ')}
                              >
                                {p.kind === 'custom' ? '커스텀' : '이미지'}
                              </span>
                            </button>
                          )
                        })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 페이지 내용 */}
                    {pages.length === 0 || !active ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                        아직 생성된 페이지가 없습니다. 위 버튼으로 페이지를 추가해보세요.
                      </div>
                    ) : active.kind === 'custom' ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-gray-900">하위 메뉴</div>
                              <div className="text-xs text-gray-600 mt-1">
                                1페이지 안에서 텍스트/이미지 컴포넌트를 최대 4개까지 등록할 수 있습니다.
                              </div>
                            </div>
                            {!blockFull ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => addTextBlock(deviceId, active.id)}
                                  className="px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
                                >
                                  텍스트 추가
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addImageBlock(deviceId, active.id)}
                                  className="px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
                                >
                                  이미지 추가
                                </button>
                              </div>
                            ) : (
                              <div className="text-sm font-semibold text-gray-600">최대 수량(4개)에 도달했습니다.</div>
                            )}
                          </div>
                        </div>

                        {activeBlocks.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                            아직 등록된 컴포넌트가 없습니다. 위 버튼으로 추가해보세요.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {activeBlocks.map((b, idx) => (
                              <div key={b.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {idx + 1}. {b.type === 'text' ? '텍스트' : '이미지'} 컴포넌트
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeBlock(deviceId, active.id, b.id)}
                                    className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-sm font-semibold"
                                  >
                                    삭제
                                  </button>
                                </div>

                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="flex flex-col sm:flex-row gap-3 sm:items-start md:col-span-2">
                                    <div className="space-y-1.5 w-full sm:basis-2/5">
                                      <div className="text-xs font-semibold text-gray-700">소제목</div>
                                      <input
                                        value={b.subtitle}
                                        maxLength={10}
                                        onChange={(e) => updateBlock(deviceId, active.id, b.id, { subtitle: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-1.5 text-sm"
                                        placeholder="소제목"
                                      />
                                    </div>
                                    <div className="space-y-1.5 w-full sm:basis-3/5">
                                      <div className="text-xs font-semibold text-gray-700">본문</div>
                                      <textarea
                                        value={b.body}
                                        onChange={(e) => updateBlock(deviceId, active.id, b.id, { body: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm resize-none"
                                        rows={3}
                                        placeholder="본문"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {b.type === 'image' && (
                                  <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                    {(() => {
                                      const expanded = !!expandedImageBlocks[b.id]
                                      const hasImage = !!b.previewUrl

                                      return (
                                        <>
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <div className="text-sm font-semibold text-gray-900">이미지</div>
                                              <span
                                                className={[
                                                  'text-[11px] px-2 py-0.5 rounded-full border',
                                                  hasImage
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-gray-100 text-gray-700 border-gray-200',
                                                ].join(' ')}
                                              >
                                                {hasImage ? '첨부됨' : '없음'}
                                              </span>
                                              {hasImage && (
                                                <button
                                                  type="button"
                                                  onClick={() => setPreviewUrl(b.previewUrl)}
                                                  className="text-xs text-indigo-700 hover:text-indigo-800 font-semibold truncate max-w-[180px]"
                                                  title={b.file?.name || '첨부 이미지'}
                                                >
                                                  {b.file?.name || '첨부 이미지'}
                                                </button>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                              <input
                                                ref={(el) => {
                                                  customImageFileInputRefs.current[b.id] = el
                                                }}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const file = Array.from(e.target.files || []).find((f) => f.type.startsWith('image/'))
                                                  attachImageToBlock(deviceId, active.id, b.id, file || null)
                                                  e.target.value = ''
                                                }}
                                              />
                                              <button
                                                type="button"
                                                onClick={() => customImageFileInputRefs.current[b.id]?.click()}
                                                className="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold"
                                              >
                                                이미지 선택
                                              </button>
                                              {hasImage && (
                                                <button
                                                  type="button"
                                                  onClick={() => attachImageToBlock(deviceId, active.id, b.id, null)}
                                                  className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
                                                >
                                                  초기화
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => setExpandedImageBlocks((prev) => ({ ...prev, [b.id]: !expanded }))}
                                                className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
                                              >
                                                {expanded ? '첨부 영역 닫기' : '첨부 영역 열기'}
                                              </button>
                                            </div>
                                          </div>

                                          {/* 접힘 상태에서는 공간 최소화 */}
                                          {expanded && (
                                            <>
                                              <div className="text-xs text-gray-600 mt-2">
                                                드래그 앤 드롭 또는 버튼으로 파일을 선택하세요.
                                              </div>

                                              <div
                                                className={[
                                                  'mt-2 rounded-2xl border border-dashed p-3',
                                                  customImageDragOverBlockId === b.id
                                                    ? 'border-indigo-500 bg-indigo-50'
                                                    : 'border-gray-300 bg-white',
                                                ].join(' ')}
                                                onDragOver={(e) => {
                                                  e.preventDefault()
                                                  setCustomImageDragOverBlockId(b.id)
                                                }}
                                                onDragLeave={() =>
                                                  setCustomImageDragOverBlockId((cur) => (cur === b.id ? null : cur))
                                                }
                                                onDrop={(e) => {
                                                  e.preventDefault()
                                                  setCustomImageDragOverBlockId(null)
                                                  const file = Array.from(e.dataTransfer.files || []).find((f) =>
                                                    f.type.startsWith('image/'),
                                                  )
                                                  if (file) attachImageToBlock(deviceId, active.id, b.id, file)
                                                }}
                                              >
                                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                                  <div className="text-sm text-gray-700">
                                                    <div className="font-semibold">이미지를 여기로 드래그</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">이미지 파일만 선택됩니다.</div>
                                                  </div>
                                                </div>
                                              </div>

                                              <div className="mt-2">
                                                {b.previewUrl ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setPreviewUrl(b.previewUrl)}
                                                    className="block w-full"
                                                  >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                      src={b.previewUrl}
                                                      alt="첨부 이미지 미리보기"
                                                      className="w-full max-h-40 object-contain rounded-xl border border-gray-200 bg-white"
                                                    />
                                                  </button>
                                                ) : (
                                                  <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-500">
                                                    첨부된 이미지가 없습니다.
                                                  </div>
                                                )}
                                              </div>
                                            </>
                                          )}
                                        </>
                                      )
                                    })()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      (() => {
                        const assets = assetsByDeviceId[deviceId] || []
                        const isLoadingAssets = loadingAssetsId === deviceId
                        const isUploading = uploadingId === deviceId
                        const isDragOver = dragOverId === deviceId

                        return (
                          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-gray-900">디바이스 이미지</div>
                              <button
                                type="button"
                                onClick={() => loadAssets(deviceId)}
                                className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
                              >
                                새로고침
                              </button>
                            </div>

                            {isLoadingAssets ? (
                              <div className="py-6 text-center text-sm text-gray-500">불러오는 중...</div>
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
                                        <img src={a.thumb_url} alt={a.name} className="h-24 w-full object-cover" loading="lazy" />
                                      ) : (
                                        <div className="h-24 w-full flex items-center justify-center text-xs text-gray-400">미리보기 불가</div>
                                      )}
                                    </button>

                                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-1.5 bg-white/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity">
                                      <div className="text-[11px] text-gray-600 truncate min-w-0" title={a.name}>
                                        {a.name}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!confirm('해당 파일을 삭제하시겠습니까?')) return
                                          try {
                                            const res = await fetch(
                                              `/api/school/device-assets?school_device_id=${encodeURIComponent(
                                                deviceId,
                                              )}&original_path=${encodeURIComponent(a.original_path)}`,
                                              { method: 'DELETE', credentials: 'include' },
                                            )
                                            const data = await res.json().catch(() => ({}))
                                            if (!res.ok) throw new Error(data.error || '삭제 실패')
                                            await loadAssets(deviceId)
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

                            <div
                              className={[
                                'mt-4 rounded-2xl border border-dashed p-4',
                                isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white',
                              ].join(' ')}
                              onDragOver={(e) => {
                                e.preventDefault()
                                setDragOverId(deviceId)
                              }}
                              onDragLeave={() => setDragOverId((cur) => (cur === deviceId ? null : cur))}
                              onDrop={async (e) => {
                                e.preventDefault()
                                setDragOverId(null)
                                const fileList = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'))
                                await uploadFiles(deviceId, fileList)
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
                                      fileInputRefs.current[deviceId] = el
                                    }}
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    disabled={isUploading}
                                    onChange={async (e) => {
                                      const fileList = Array.from(e.target.files || [])
                                      await uploadFiles(deviceId, fileList)
                                      e.target.value = ''
                                    }}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    disabled={isUploading}
                                    onClick={() => fileInputRefs.current[deviceId]?.click()}
                                    className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold shadow-sm disabled:opacity-60"
                                  >
                                    {isUploading ? '업로드 중…' : '이미지 업로드'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()
                    )}
                  </div>
                )
              })()}
            </div>
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


