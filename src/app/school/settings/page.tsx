'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // DB 연동(테스트 DB): Storage 경로/URL
  image_name?: string | null
  image_original_path?: string | null
  image_thumb_path?: string | null
  image_full_url?: string | null
  image_thumb_url?: string | null
}

type CustomBlock = CustomTextBlock | CustomImageBlock

type SettingsPage = {
  id: string
  kind: 'custom' | 'images'
  name: string
  blocks: CustomBlock[]
  // images 페이지 전용
  image_name?: string | null
  image_original_path?: string | null
  image_thumb_path?: string | null
  image_full_url?: string | null
  image_thumb_url?: string | null
}

type DraftImageMeta = {
  _pendingFile?: File | null
  _pendingPreviewUrl?: string | null
  _pendingClear?: boolean
}

type DraftBlock = (CustomTextBlock | (CustomImageBlock & DraftImageMeta)) & {
  _temp?: boolean
}

type DraftSettingsPage = Omit<SettingsPage, 'blocks'> &
  DraftImageMeta & {
    _temp?: boolean
    blocks: DraftBlock[]
  }

export default function SchoolSettingsPage() {
  const [devices, setDevices] = useState<SchoolDeviceInstance[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)


  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)


  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settingsTarget, setSettingsTarget] = useState<{ id: string; label: string } | null>(null)

  const [pagesByDeviceId, setPagesByDeviceId] = useState<Record<string, DraftSettingsPage[]>>({})
  const [originalPagesByDeviceId, setOriginalPagesByDeviceId] = useState<Record<string, SettingsPage[]>>({})
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [customImageDragOverBlockId, setCustomImageDragOverBlockId] = useState<string | null>(null)
  const [expandedImageBlocks, setExpandedImageBlocks] = useState<Record<string, boolean>>({})
  const customImageFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const pageImageFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)

  // 업로드 413 방지(환경별 body limit 대응): 5MB 초과 시 브라우저에서 자동 압축/리사이즈
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
  const MAX_DIM = 1920

  const compressImageIfNeeded = async (file: File): Promise<File> => {
    try {
      if (!file || !(file instanceof File)) return file
      if (!file.type?.startsWith('image/')) return file
      if (file.size <= MAX_UPLOAD_BYTES) return file

      const bitmap = await createImageBitmap(file)
      let w = bitmap.width
      let h = bitmap.height

      const maxSide = Math.max(w, h)
      if (maxSide > MAX_DIM) {
        const scale = MAX_DIM / maxSide
        w = Math.max(1, Math.round(w * scale))
        h = Math.max(1, Math.round(h * scale))
      }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, w, h)

      // quality를 낮추며 5MB 이하가 되도록 시도
      let quality = 0.86
      let blob: Blob | null = null
      for (let i = 0; i < 8; i++) {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
        )
        if (!blob) break
        if (blob.size <= MAX_UPLOAD_BYTES) break
        quality = Math.max(0.5, quality - 0.08)
        if (quality === 0.5 && blob.size > MAX_UPLOAD_BYTES) {
          // 해상도도 추가로 축소
          w = Math.max(1, Math.round(w * 0.85))
          h = Math.max(1, Math.round(h * 0.85))
          canvas.width = w
          canvas.height = h
          ctx.drawImage(bitmap, 0, 0, w, h)
        }
      }

      if (!blob) return file

      const base = (file.name || 'image').replace(/\.[^/.]+$/, '')
      const newName = `${base || 'image'}.jpg`
      return new File([blob], newName, { type: 'image/jpeg' })
    } catch {
      return file
    }
  }

  const [memoModalOpen, setMemoModalOpen] = useState(false)
  const [memoTarget, setMemoTarget] = useState<{ id: string; label: string } | null>(null)
  const [memoText, setMemoText] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)

  // 하트 케어 ID 매핑 모달
  const [heartRateMappingModalOpen, setHeartRateMappingModalOpen] = useState(false)
  const [heartRateMappings, setHeartRateMappings] = useState<Array<{ student_no: number; device_id: string }>>([])
  const [heartRateMappingSaving, setHeartRateMappingSaving] = useState(false)
  const [heartRateMappingLabel, setHeartRateMappingLabel] = useState('')

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







  useEffect(() => {
    loadDevices()
  }, [])

  // DB 연동으로 이미지는 signed URL 기반(브라우저 object URL 미사용)

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveHex = (hex: any) => {
    const v = String(hex || '').trim()
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
  }

  const loadDevicePages = async (schoolDeviceId: string) => {
    const res = await fetch(`/api/school/device-pages?school_device_id=${encodeURIComponent(schoolDeviceId)}`, {
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '페이지 불러오기 실패')

    const items = Array.isArray(data.items) ? data.items : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages: SettingsPage[] = items.map((p: any) => ({
      id: String(p.id),
      kind: p.kind === 'images' ? 'images' : 'custom',
      name: String(p.name || ''),
      image_name: p.image_name ?? null,
      image_original_path: p.image_original_path ?? null,
      image_thumb_path: p.image_thumb_path ?? null,
      image_full_url: p.image_full_url ?? null,
      image_thumb_url: p.image_thumb_url ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blocks: (Array.isArray(p.blocks) ? p.blocks : []).map((b: any) => {
        if (String(b.type) === 'image') {
          const bb: CustomImageBlock = {
            id: String(b.id),
            type: 'image',
            subtitle: String(b.subtitle || ''),
            body: String(b.body || ''),
            image_name: b.image_name ?? null,
            image_original_path: b.image_original_path ?? null,
            image_thumb_path: b.image_thumb_path ?? null,
            image_full_url: b.image_full_url ?? null,
            image_thumb_url: b.image_thumb_url ?? null,
          }
          return bb
        }
        const tt: CustomTextBlock = {
          id: String(b.id),
          type: 'text',
          subtitle: String(b.subtitle || ''),
          body: String(b.body || ''),
        }
        return tt
      }),
    }))

    // 원본(저장된 상태) 보관 + 드래프트(편집용) 생성
    setOriginalPagesByDeviceId((prev) => ({ ...prev, [schoolDeviceId]: pages }))
    const draftPages: DraftSettingsPage[] = pages.map((p) => ({
      ...p,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blocks: (p.blocks || []).map((b) => ({ ...(b as any) })) as DraftBlock[],
    }))
    setPagesByDeviceId((prev) => ({ ...prev, [schoolDeviceId]: draftPages }))
    setActivePageId((cur) => (cur && pages.some((p) => p.id === cur) ? cur : pages[0]?.id || null))
    setSettingsDirty(false)
    setSettingsLoading(false)
  }

  const openSettingsModal = async (id: string, label: string) => {
    // 이전 드래프트가 잠깐 보였다가 사라지는 “깜빡임” 방지:
    // 모달 오픈 직전에 해당 디바이스 드래프트를 즉시 초기화하고 로딩 UI로 전환
    setSettingsDirty(false)
    setSettingsLoading(true)
    setActivePageId(null)
    setExpandedImageBlocks({})
    setCustomImageDragOverBlockId(null)
    setPagesByDeviceId((prev) => ({ ...prev, [id]: [] }))
    setOriginalPagesByDeviceId((prev) => ({ ...prev, [id]: [] }))

    setSettingsTarget({ id, label })
    setSettingsModalOpen(true)
    try {
      await loadDevicePages(id)
    } catch (e: unknown) {
      setSettingsLoading(false)
      const message = e instanceof Error ? e.message : String(e)
      alert(message || '페이지 불러오기 실패')
    }
  }

  const closeSettingsModal = () => {
    if (settingsSaving) return
    if (settingsDirty && !confirm('저장되지 않은 변경사항이 있습니다. 닫을까요?')) return

    // 드래프트에서 생성한 objectURL 정리
    if (settingsTarget) {
      const cur = pagesByDeviceId[settingsTarget.id] || []
      for (const p of cur) {
        if (p._pendingPreviewUrl) revokePreview(p._pendingPreviewUrl)
        for (const b of p.blocks || []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bb: any = b
          if (bb?._pendingPreviewUrl) revokePreview(bb._pendingPreviewUrl)
        }
      }
    }

    setSettingsModalOpen(false)
    setSettingsTarget(null)
    setActivePageId(null)
    setCustomImageDragOverBlockId(null)
    setExpandedImageBlocks({})
    setSettingsDirty(false)
  }

  const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`
  const makeTempId = () => `tmp_${makeId()}`
  const isTempId = (id: string) => String(id || '').startsWith('tmp_')

  const revokePreview = (url: string | null | undefined) => {
    try {
      if (url) URL.revokeObjectURL(url)
    } catch { }
  }

  const ensurePages = (schoolDeviceId: string) => {
    setPagesByDeviceId((prev) => (prev[schoolDeviceId] ? prev : { ...prev, [schoolDeviceId]: [] }))
  }

  const addSettingsPage = (schoolDeviceId: string, kind: SettingsPage['kind']) => {
    setPagesByDeviceId((prev) => {
      const cur = prev[schoolDeviceId] || []
      if (cur.length >= 8) return prev

      const imageCount = cur.filter((p) => p.kind === 'images').length
      const customCount = cur.filter((p) => p.kind === 'custom').length
      const name = kind === 'images' ? `${imageCount + 1}-이미지` : `${customCount + 1}-페이지`

      const next: DraftSettingsPage = {
        id: makeTempId(),
        _temp: true,
        kind,
        name,
        blocks: [],
      }
      const nextPages = [...cur, next]
      setActivePageId(next.id)
      setSettingsDirty(true)
      return { ...prev, [schoolDeviceId]: nextPages }
    })
  }

  const addTextBlock = (schoolDeviceId: string, pageId: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          if (p.kind !== 'custom') return p
          if ((p.blocks || []).length >= 4) return p
          const next: DraftBlock = { id: makeTempId(), _temp: true, type: 'text', subtitle: '', body: '' }
          setSettingsDirty(true)
          return { ...p, blocks: [...(p.blocks || []), next] }
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
          if ((p.blocks || []).length >= 4) return p
          const next: DraftBlock = {
            id: makeTempId(),
            _temp: true,
            type: 'image',
            subtitle: '',
            body: '',
            image_name: null,
            image_original_path: null,
            image_thumb_path: null,
            image_full_url: null,
            image_thumb_url: null,
          }
          setSettingsDirty(true)
          return { ...p, blocks: [...(p.blocks || []), next] }
        }),
      }
    })
  }

  const removeSettingsPage = (schoolDeviceId: string, pageId: string) => {
    setPagesByDeviceId((prev) => {
      const cur = prev[schoolDeviceId] || []
      const target = cur.find((p) => p.id === pageId)
      if (target?._pendingPreviewUrl) revokePreview(target._pendingPreviewUrl)
      for (const b of target?.blocks || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((b as any)._pendingPreviewUrl) revokePreview((b as any)._pendingPreviewUrl)
      }

      const remaining = cur.filter((p) => p.id !== pageId)
      // 이미지 페이지는 즉시 연속 번호로 표시(입력 불가 영역이므로)
      let imageOrd = 0
      const renamed = remaining.map((p) => {
        if (p.kind !== 'images') return p
        imageOrd += 1
        return { ...p, name: `${imageOrd}-이미지` }
      })
      const nextActive = renamed[0]?.id || null
      setActivePageId((curActive) => (curActive === pageId ? nextActive : curActive))
      setSettingsDirty(true)
      return { ...prev, [schoolDeviceId]: renamed }
    })
  }

  const updateSettingsPageName = (schoolDeviceId: string, pageId: string, name: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => (p.id === pageId ? { ...p, name } : p)),
      }
    })
    setSettingsDirty(true)
  }

  const removeBlock = (schoolDeviceId: string, pageId: string, blockId: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const target = (p.blocks || []).find((b) => b.id === blockId) as any
          if (target?._pendingPreviewUrl) revokePreview(target._pendingPreviewUrl)
          setSettingsDirty(true)
          return { ...p, blocks: (p.blocks || []).filter((b) => b.id !== blockId) }
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
            blocks: (p.blocks || []).map((b) => (b.id === blockId ? ({ ...b, ...patch } as DraftBlock) : b)),
          }
        }),
      }
    })
    setSettingsDirty(true)
  }

  const setPageImageDraft = (schoolDeviceId: string, pageId: string, file: File | null) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          if (p._pendingPreviewUrl) revokePreview(p._pendingPreviewUrl)
          const nextPreview = file ? URL.createObjectURL(file) : null
          setSettingsDirty(true)
          return { ...p, _pendingFile: file, _pendingPreviewUrl: nextPreview, _pendingClear: false }
        }),
      }
    })
  }

  const clearPageImageDraft = (schoolDeviceId: string, pageId: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          if (p._pendingPreviewUrl) revokePreview(p._pendingPreviewUrl)
          setSettingsDirty(true)
          return { ...p, _pendingFile: null, _pendingPreviewUrl: null, _pendingClear: true }
        }),
      }
    })
  }

  const setBlockImageDraft = (schoolDeviceId: string, pageId: string, blockId: string, file: File | null) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          return {
            ...p,
            blocks: (p.blocks || []).map((b) => {
              if (b.id !== blockId) return b
              if (b.type !== 'image') return b
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const bb = b as any
              if (bb._pendingPreviewUrl) revokePreview(bb._pendingPreviewUrl)
              const nextPreview = file ? URL.createObjectURL(file) : null
              setSettingsDirty(true)
              return { ...b, _pendingFile: file, _pendingPreviewUrl: nextPreview, _pendingClear: false }
            }),
          }
        }),
      }
    })
  }

  const clearBlockImageDraft = (schoolDeviceId: string, pageId: string, blockId: string) => {
    setPagesByDeviceId((prev) => {
      const pages = prev[schoolDeviceId] || []
      return {
        ...prev,
        [schoolDeviceId]: pages.map((p) => {
          if (p.id !== pageId) return p
          return {
            ...p,
            blocks: (p.blocks || []).map((b) => {
              if (b.id !== blockId) return b
              if (b.type !== 'image') return b
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const bb = b as any
              if (bb._pendingPreviewUrl) revokePreview(bb._pendingPreviewUrl)
              setSettingsDirty(true)
              return { ...b, _pendingFile: null, _pendingPreviewUrl: null, _pendingClear: true }
            }),
          }
        }),
      }
    })
  }

  const saveSettings = async () => {
    if (!settingsTarget) return
    if (settingsSaving) return
    const schoolDeviceId = settingsTarget.id
    const draftPages = pagesByDeviceId[schoolDeviceId] || []
    const origPages = originalPagesByDeviceId[schoolDeviceId] || []

    setSettingsSaving(true)
    try {
      const fetchJson = async (url: string, init?: RequestInit) => {
        const res = await fetch(url, { credentials: 'include', ...init })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `요청 실패: ${res.status}`)
        return data
      }

      const pageIdMap = new Map<string, string>() // tmp -> real
      const blockIdMap = new Map<string, string>() // tmp -> real

      const origPageIds = new Set(origPages.map((p) => p.id))
      const draftRealPageIds = new Set(draftPages.filter((p) => !isTempId(p.id)).map((p) => p.id))

      // 1) 삭제된 페이지 제거
      for (const p of origPages) {
        if (!draftRealPageIds.has(p.id)) {
          await fetchJson(`/api/school/device-pages/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
        }
      }

      // 2) 새 페이지 생성
      for (const p of draftPages) {
        if (!isTempId(p.id)) continue
        const created = await fetchJson('/api/school/device-pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_device_id: schoolDeviceId, kind: p.kind }),
        })
        const realId = String(created?.item?.id || '')
        if (!realId) throw new Error('페이지 생성 결과가 올바르지 않습니다.')
        pageIdMap.set(p.id, realId)
        // 커스텀 페이지는 사용자가 이름을 바꿀 수 있으니 저장
        if (p.kind === 'custom' && p.name && p.name !== String(created?.item?.name || '')) {
          await fetchJson(`/api/school/device-pages/${encodeURIComponent(realId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: p.name }),
          })
        }
      }

      const resolvePageId = (id: string) => pageIdMap.get(id) || id

      // 3) 기존 페이지 이름 변경(커스텀만)
      const origById = new Map(origPages.map((p) => [p.id, p]))
      for (const p of draftPages) {
        const pid = resolvePageId(p.id)
        if (!origPageIds.has(pid)) continue
        const orig = origById.get(pid)
        if (!orig) continue
        if (p.kind === 'custom' && String(orig.name || '') !== String(p.name || '')) {
          await fetchJson(`/api/school/device-pages/${encodeURIComponent(pid)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: p.name }),
          })
        }
      }

      // 4) 이미지 페이지 이미지 업로드/삭제(드래프트)
      for (const p of draftPages) {
        if (p.kind !== 'images') continue
        const pid = resolvePageId(p.id)
        if (p._pendingClear) {
          await fetchJson(`/api/school/device-pages/${encodeURIComponent(pid)}/image`, { method: 'DELETE' })
        } else if (p._pendingFile) {
          const form = new FormData()
          form.append('file', p._pendingFile)
          await fetchJson(`/api/school/device-pages/${encodeURIComponent(pid)}/image`, { method: 'POST', body: form })
        }
      }

      // 5) 블록 CRUD + 이미지(블록)
      for (const p of draftPages) {
        if (p.kind !== 'custom') continue
        const pid = resolvePageId(p.id)
        const origPage = origById.get(pid)
        const origBlocks = (origPage?.blocks || []) as CustomBlock[]
        const origBlockIds = new Set(origBlocks.map((b) => b.id))
        const draftBlocks = p.blocks || []
        const draftRealBlockIds = new Set(draftBlocks.filter((b) => !isTempId(b.id)).map((b) => b.id))

        // 삭제된 블록 제거
        for (const b of origBlocks) {
          if (!draftRealBlockIds.has(b.id)) {
            await fetchJson(`/api/school/device-page-blocks/${encodeURIComponent(b.id)}`, { method: 'DELETE' })
          }
        }

        // 새 블록 생성
        for (const b of draftBlocks) {
          if (!isTempId(b.id)) continue
          const created = await fetchJson('/api/school/device-page-blocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              page_id: pid,
              type: b.type,
              subtitle: b.subtitle || '',
              body: b.body || '',
            }),
          })
          const realId = String(created?.item?.id || '')
          if (!realId) throw new Error('블록 생성 결과가 올바르지 않습니다.')
          blockIdMap.set(b.id, realId)

          // 이미지 블록이면 업로드(드래프트)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (b.type === 'image' && (b as any)._pendingFile) {
            const form = new FormData()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.append('file', (b as any)._pendingFile)
            await fetchJson(`/api/school/device-page-blocks/${encodeURIComponent(realId)}/image`, { method: 'POST', body: form })
          }
        }

        const resolveBlockId = (id: string) => blockIdMap.get(id) || id

        // 기존 블록 텍스트 업데이트 + 이미지 업로드/삭제
        const origBlockById = new Map(origBlocks.map((b) => [b.id, b]))
        for (const b of draftBlocks) {
          const bid = resolveBlockId(b.id)
          if (!origBlockIds.has(bid)) continue
          const origB = origBlockById.get(bid)
          if (!origB) continue

          if (String(origB.subtitle || '') !== String(b.subtitle || '') || String(origB.body || '') !== String(b.body || '')) {
            await fetchJson(`/api/school/device-page-blocks/${encodeURIComponent(bid)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subtitle: b.subtitle || '', body: b.body || '' }),
            })
          }

          if (b.type === 'image') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bb = b as any
            if (bb._pendingClear) {
              await fetchJson(`/api/school/device-page-blocks/${encodeURIComponent(bid)}/image`, { method: 'DELETE' })
            } else if (bb._pendingFile) {
              const form = new FormData()
              form.append('file', bb._pendingFile)
              await fetchJson(`/api/school/device-page-blocks/${encodeURIComponent(bid)}/image`, { method: 'POST', body: form })
            }
          }
        }
      }

      // 6) 재로드(저장된 값으로 드래프트 초기화)
      await loadDevicePages(schoolDeviceId)
      setSettingsDirty(false)
      alert('저장 완료')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      alert(message || '저장 실패')
    } finally {
      setSettingsSaving(false)
    }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      alert(e.message || '메모 저장 실패')
    } finally {
      setMemoSaving(false)
    }
  }

  // 하트 케어 ID 매핑 모달 열기
  const openHeartRateMappingModal = async (label: string) => {
    setHeartRateMappingLabel(label)
    try {
      const res = await fetch('/api/school/heart-rate-mappings', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '매핑 데이터 조회 실패')

      // 1~30번 기본 값 생성 후 기존 데이터 병합
      const mappingsData = Array.isArray(data.mappings) ? data.mappings : []
      const initial = Array.from({ length: 30 }, (_, i) => ({
        student_no: i + 1,
        device_id: '',
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mappingsData.forEach((m: any) => {
        const idx = Number(m.student_no) - 1
        if (idx >= 0 && idx < 30) {
          initial[idx].device_id = String(m.device_id || '')
        }
      })
      setHeartRateMappings(initial)
      setHeartRateMappingModalOpen(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      alert(e.message || '매핑 데이터 조회 실패')
    }
  }

  // 하트 케어 ID 매핑 저장
  const saveHeartRateMappings = async () => {
    setHeartRateMappingSaving(true)
    try {
      const res = await fetch('/api/school/heart-rate-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mappings: heartRateMappings }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '저장 실패')

      alert('하트 케어 ID 매핑이 저장되었습니다.')
      setHeartRateMappingModalOpen(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      alert(e.message || '저장 실패')
    } finally {
      setHeartRateMappingSaving(false)
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
                                  // "심박기록관리" 또는 "하트 케어" 콘텐츠인 경우 하트 케어 ID 매핑 모달 표시
                                  if (d.content_name === '심박기록관리' || d.content_name === '하트 케어' || d.content_name === '하트케어') {
                                    await openHeartRateMappingModal(`${d.device_name} #${ord}`)
                                  } else {
                                    // 그 외의 경우 기존 설정 모달 표시
                                    ensurePages(d.id)
                                    await openSettingsModal(d.id, `${d.device_name} #${ord}`)
                                  }
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
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
            <div className="px-6 py-4 border-b border-gray-200">
              {(() => {
                const pages = pagesByDeviceId[settingsTarget.id] || []
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const pageFull = pages.length >= 8
                return (
                  <>
                    {/* 1줄: 타이틀 + 저장(닫기 왼쪽) + 닫기 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-lg font-semibold truncate">설정 - {settingsTarget.label}</div>
                          <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
                            {pages.length}/8
                          </span>
                          {settingsDirty && (
                            <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
                              저장 필요
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">변경 후 “저장”을 눌러야 반영됩니다.</div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!settingsDirty || settingsSaving}
                          onClick={saveSettings}
                          className={[
                            'px-3 py-1.5 rounded-xl text-sm font-semibold border shadow-sm disabled:opacity-60',
                            settingsDirty
                              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                              : 'bg-gray-100 text-gray-400 border-gray-200',
                          ].join(' ')}
                        >
                          {settingsSaving ? '저장 중…' : '저장'}
                        </button>
                        <button
                          type="button"
                          onClick={closeSettingsModal}
                          className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 text-sm font-semibold"
                        >
                          닫기
                        </button>
                      </div>
                    </div>

                    {/* 2줄: 페이지 추가 버튼 (로딩 중엔 숨김) */}
                    {!settingsLoading && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={pageFull || settingsSaving}
                          onClick={() => addSettingsPage(settingsTarget.id, 'custom')}
                          className={[
                            'px-3 py-2 rounded-xl text-sm font-semibold border shadow-sm disabled:opacity-60',
                            pageFull
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700',
                          ].join(' ')}
                        >
                          커스텀 페이지 추가
                        </button>
                        <button
                          type="button"
                          disabled={pageFull || settingsSaving}
                          onClick={() => addSettingsPage(settingsTarget.id, 'images')}
                          className={[
                            'px-3 py-2 rounded-xl text-sm font-semibold border shadow-sm disabled:opacity-60',
                            pageFull
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600',
                          ].join(' ')}
                        >
                          이미지 페이지 추가
                        </button>
                        {pageFull && <span className="text-xs text-gray-500 ml-1">페이지 최대 8개</span>}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div className="px-6 pb-4 pt-0 overflow-y-auto">
              {(() => {
                const deviceId = settingsTarget.id
                const pages = pagesByDeviceId[deviceId] || []

                const active = pages.find((p) => p.id === activePageId) || pages[0] || null
                const activeBlocks = active?.kind === 'custom' ? active.blocks : []
                const blockFull = active?.kind === 'custom' ? activeBlocks.length >= 4 : true

                return (
                  <div className="space-y-4">
                    {settingsLoading && (
                      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                        불러오는 중...
                      </div>
                    )}

                    {/* 페이지 탭 */}
                    {!settingsLoading && pages.length > 0 && (
                      <div className="sticky top-0 z-30 -mx-6 px-6 pt-0 pb-3 bg-white/95 backdrop-blur border-b border-gray-200">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2 shadow-sm">
                          <div className="grid grid-cols-4 gap-2">
                            {pages.map((p, idx) => {
                              const selected = (active?.id || null) === p.id
                              return (
                                <div key={p.id} className="relative w-full">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setActivePageId(p.id)
                                    }}
                                    className={[
                                      'w-full px-3 py-2 rounded-2xl text-sm font-semibold border flex items-center gap-2 shadow-sm pr-9 justify-start',
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
                                    <span className="max-w-[140px] truncate" title={p.name || `${idx + 1}페이지`}>
                                      {p.name || `${idx + 1}페이지`}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      if (!confirm(`${p.name || `${idx + 1}페이지`}를 삭제하시겠습니까?`)) return
                                      removeSettingsPage(deviceId, p.id)
                                    }}
                                    className={[
                                      'absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full border text-xs font-bold',
                                      selected
                                        ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
                                        : 'border-gray-200 bg-white/70 text-rose-600 hover:bg-rose-50',
                                    ].join(' ')}
                                    aria-label={`${idx + 1}페이지 삭제`}
                                    title="페이지 삭제"
                                  >
                                    <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 페이지 내용 */}
                    {settingsLoading ? null : pages.length === 0 || !active ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                        아직 생성된 페이지가 없습니다. 위 버튼으로 페이지를 추가해보세요.
                      </div>
                    ) : active.kind === 'custom' ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-gray-900">페이지 이름</div>
                              <div className="mt-2">
                                <input
                                  value={active.name || ''}
                                  onChange={(e) => updateSettingsPageName(deviceId, active.id, e.target.value)}
                                  className="w-full sm:w-[250px] rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                                  maxLength={20}
                                />
                              </div>
                            </div>
                            {!blockFull ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => addTextBlock(deviceId, active.id)}
                                  className="px-3 py-2 rounded-xl bg-indigo-50/70 border border-indigo-200/70 hover:bg-indigo-50 text-indigo-800 text-sm font-semibold"
                                >
                                  텍스트 추가
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addImageBlock(deviceId, active.id)}
                                  className="px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200/70 hover:bg-amber-50 text-amber-900 text-sm font-semibold"
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
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const bb: any = b
                                      const pendingPreview: string | null = bb._pendingPreviewUrl || null
                                      const pendingFile: File | null = bb._pendingFile || null
                                      const pendingClear: boolean = !!bb._pendingClear
                                      const thumb = pendingClear
                                        ? null
                                        : pendingPreview || b.image_thumb_url || b.image_full_url || null
                                      const full = pendingClear ? null : pendingPreview || b.image_full_url || b.image_thumb_url || null
                                      const hasImage = !!thumb || !!full

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
                                                  onClick={() => {
                                                    if (full) setPreviewUrl(full)
                                                  }}
                                                  className="text-xs text-indigo-700 hover:text-indigo-800 font-semibold truncate max-w-[180px]"
                                                  title={pendingFile?.name || b.image_name || '첨부 이미지'}
                                                >
                                                  {pendingFile?.name || b.image_name || '첨부 이미지'}
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
                                                onChange={async (e) => {
                                                  const file = Array.from(e.target.files || []).find((f) => f.type.startsWith('image/'))
                                                  if (!file) return
                                                  const prepared = await compressImageIfNeeded(file)
                                                  setBlockImageDraft(deviceId, active.id, b.id, prepared)
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
                                                  onClick={() => clearBlockImageDraft(deviceId, active.id, b.id)}
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
                                                onDrop={async (e) => {
                                                  e.preventDefault()
                                                  setCustomImageDragOverBlockId(null)
                                                  const file = Array.from(e.dataTransfer.files || []).find((f) =>
                                                    f.type.startsWith('image/'),
                                                  )
                                                  if (!file) return
                                                  const prepared = await compressImageIfNeeded(file)
                                                  setBlockImageDraft(deviceId, active.id, b.id, prepared)
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
                                                {thumb || full ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      if (full) setPreviewUrl(full)
                                                    }}
                                                    className="block w-full"
                                                  >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                      src={thumb || full || ''}
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
                        const pageId = active.id
                        const isUploading = settingsSaving
                        const isDragOver = dragOverId === pageId
                        const pendingPreview: string | null = active._pendingPreviewUrl || null
                        const pendingFile: File | null = active._pendingFile || null
                        const pendingClear: boolean = !!active._pendingClear
                        const hasImage = pendingClear
                          ? false
                          : !!(pendingPreview || active.image_full_url || active.image_thumb_url || active.image_original_path)
                        const thumb = pendingClear
                          ? null
                          : pendingPreview || active.image_thumb_url || active.image_full_url || null
                        const full = pendingClear ? null : pendingPreview || active.image_full_url || active.image_thumb_url || null

                        return (
                          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-gray-900">이미지 페이지</div>
                              <div className="flex items-center gap-2">
                                <input
                                  ref={(el) => {
                                    pageImageFileInputRefs.current[pageId] = el
                                  }}
                                  type="file"
                                  accept="image/*"
                                  disabled={isUploading}
                                  onChange={async (e) => {
                                    const file = Array.from(e.target.files || []).find((f) => f.type.startsWith('image/'))
                                    if (!file) return
                                    const prepared = await compressImageIfNeeded(file)
                                    setPageImageDraft(deviceId, pageId, prepared)
                                    e.target.value = ''
                                  }}
                                  className="hidden"
                                />

                                <button
                                  type="button"
                                  disabled={isUploading}
                                  onClick={() => pageImageFileInputRefs.current[pageId]?.click()}
                                  className={[
                                    'px-3 py-1.5 rounded-xl text-sm font-semibold border shadow-sm disabled:opacity-60',
                                    hasImage
                                      ? 'bg-amber-50/70 border-amber-200/70 text-amber-900 hover:bg-amber-50'
                                      : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-800',
                                  ].join(' ')}
                                >
                                  {isUploading ? '처리 중…' : hasImage ? '이미지 변경' : '이미지 1장 업로드'}
                                </button>

                                {hasImage && (
                                  <button
                                    type="button"
                                    disabled={isUploading}
                                    onClick={() => clearPageImageDraft(deviceId, pageId)}
                                    className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 text-sm font-semibold disabled:opacity-60"
                                  >
                                    삭제
                                  </button>
                                )}
                              </div>
                            </div>

                            {!hasImage ? (
                              <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                                아직 업로드된 이미지가 없습니다.
                              </div>
                            ) : (
                              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                                <div className="group relative rounded border border-gray-200 bg-white overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (full) setPreviewUrl(full)
                                    }}
                                    className="block w-full"
                                    title={pendingFile?.name || active.image_name || '이미지'}
                                  >
                                    {thumb ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={thumb}
                                        alt={pendingFile?.name || active.image_name || '이미지'}
                                        className="h-24 w-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="h-24 w-full flex items-center justify-center text-xs text-gray-400">미리보기 불가</div>
                                    )}
                                  </button>
                                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-white/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="text-[11px] text-gray-600 truncate min-w-0" title={pendingFile?.name || active.image_name || ''}>
                                      {pendingFile?.name || active.image_name || '이미지'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div
                              className={[
                                'mt-4 rounded-2xl border border-dashed p-4',
                                isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white',
                                isUploading ? 'opacity-60' : '',
                              ].join(' ')}
                              onDragOver={(e) => {
                                e.preventDefault()
                                if (isUploading) return
                                setDragOverId(pageId)
                              }}
                              onDragLeave={() => setDragOverId((cur) => (cur === pageId ? null : cur))}
                              onDrop={async (e) => {
                                e.preventDefault()
                                setDragOverId(null)
                                if (isUploading) return
                                const file = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith('image/'))
                                if (!file) return
                                const prepared = await compressImageIfNeeded(file)
                                setPageImageDraft(deviceId, pageId, prepared)
                              }}
                            >
                              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="text-sm text-gray-700">
                                  <div className="font-semibold">
                                    {hasImage ? '이미지가 이미 등록되어 있습니다 (1장만 유지)' : '이미지를 여기로 드래그해서 업로드'}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {hasImage ? '드래그/선택하면 기존 이미지가 변경됩니다.' : '또는 버튼을 눌러 파일을 선택하세요.'}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isUploading}
                                    onClick={() => pageImageFileInputRefs.current[pageId]?.click()}
                                    className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold shadow-sm disabled:opacity-60"
                                  >
                                    {isUploading ? '처리 중…' : hasImage ? '이미지 변경' : '이미지 1장 업로드'}
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

      {/* 하트 케어 ID 매핑 모달 */}
      {heartRateMappingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col text-gray-900">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">하트 케어 ID 설정 - {heartRateMappingLabel}</h3>
                <button
                  type="button"
                  onClick={() => {
                    if (heartRateMappingSaving) return
                    setHeartRateMappingModalOpen(false)
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">1~30번 학생의 하트 케어 디바이스 ID를 입력하세요.</p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {heartRateMappings.map((mapping) => (
                  <div key={mapping.student_no} className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-700">
                      {mapping.student_no}번
                    </label>
                    <input
                      type="text"
                      value={mapping.device_id}
                      onChange={(e) => {
                        const newMappings = [...heartRateMappings]
                        const idx = mapping.student_no - 1
                        newMappings[idx].device_id = e.target.value
                        setHeartRateMappings(newMappings)
                      }}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="디바이스 ID"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (heartRateMappingSaving) return
                  setHeartRateMappingModalOpen(false)
                }}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={heartRateMappingSaving}
                onClick={saveHeartRateMappings}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
              >
                {heartRateMappingSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


