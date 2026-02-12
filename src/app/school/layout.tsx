'use client'
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SchoolRoute from '@/components/SchoolRoute'
import AdminLogoutButton from '@/components/AdminLogoutButton'
import { useAuth } from '@/contexts/AuthContext'
import BackToAdminButton from '@/components/BackToAdminButton'
import Image from 'next/image'

type SchoolDevice = {
  device_id: string
  device_name: string
  start_date: string | null
  end_date: string | null
  limited_period: boolean
}

type SchoolContent = {
  school_content_id: string
  content_id: string
  name: string
  color_hex: string | null
  start_date: string | null
  end_date: string | null
  is_unlimited: boolean
}

function isExpired(d: SchoolDevice): boolean {
  if (!d.limited_period) return false
  if (!d.end_date) return false
  // 종료일 23:59:59 기준 만료 처리
  const end = new Date(`${d.end_date}T23:59:59`)
  const now = new Date()
  return end.getTime() < now.getTime()
}

function isExpiredContent(c: SchoolContent): boolean {
  if (c.is_unlimited) return false
  if (!c.end_date) return false
  const end = new Date(`${c.end_date}T23:59:59`)
  const now = new Date()
  return end.getTime() < now.getTime()
}

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { schoolName, isAdmin } = useAuth()
  const [devices, setDevices] = useState<SchoolDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [contents, setContents] = useState<SchoolContent[]>([])
  const [loadingContents, setLoadingContents] = useState(true)

  useEffect(() => {
    let ignore = false
    const load = async () => {
      setLoadingDevices(true)
      try {
        const res = await fetch('/api/school/devices', { credentials: 'include' })
        const data = await res.json()
        if (!ignore) setDevices(Array.isArray(data.items) ? data.items : [])
      } catch {
        if (!ignore) setDevices([])
      } finally {
        if (!ignore) setLoadingDevices(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    let ignore = false
    const load = async () => {
      setLoadingContents(true)
      try {
        const res = await fetch('/api/school/contents', { credentials: 'include' })
        const data = await res.json()
        if (!ignore) setContents(Array.isArray(data.items) ? data.items : [])
      } catch {
        if (!ignore) setContents([])
      } finally {
        if (!ignore) setLoadingContents(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [])

  // 관리자일 때 acting 컨텍스트 주기적 연장
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null
    const refresh = async () => {
      try {
        await fetch('/api/admin/act-as', { method: 'POST', credentials: 'include' })
      } catch { }
    }
    if (isAdmin) {
      // 진입 즉시 1회 연장 후, 30분 주기로 연장
      refresh()
      timer = setInterval(refresh, 30 * 60 * 1000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isAdmin])

  const menuDevices = useMemo(() => devices, [devices])
  const menuContents = useMemo(() => contents, [contents])
  return (
    <SchoolRoute>
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800">
        <nav className="bg-white/90 backdrop-blur border-b border-white/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center space-x-6">
                <div className="flex items-center gap-2">
                  <Image
                    src="/image/logo_atv.svg"
                    alt="스포파크 로고"
                    width={120}
                    height={40}
                    className="h-7 w-auto"
                    priority
                  />
                  <span className="text-lg font-semibold text-gray-900">운영툴</span>
                </div>
                <div className="flex items-center ml-10 gap-12 md:gap-16 text-sm font-medium">
                  <Link href="/school/students" className="text-gray-800 hover:text-gray-900 hover:underline">학생 정보입력</Link>

                  {!loadingContents && menuContents.map((c, idx) => {
                    const name = c.name.replace(/\s/g, '')
                    if (!name || name === '-' || name === ' - ') return null

                    const isExercises = name.includes('운동기록관리') || name.includes('헬스케어')
                    const isPaps = name.includes('PAPS기록관리')
                    const isHeartRate = name.includes('심박기록관리') || name.includes('하트케어') || name.includes('심박계')
                    const expired = isExpiredContent(c)

                    if (expired) {
                      return (
                        <button
                          key={`${c.school_content_id}-${idx}`}
                          onClick={() => alert('기간만료 되었습니다.')}
                          className="text-gray-400 cursor-not-allowed"
                          title={c.name}
                        >
                          {c.name}
                        </button>
                      )
                    }
                    if (isExercises) {
                      return (
                        <Link
                          key={`${c.school_content_id}-${idx}`}
                          href="/school/exercises"
                          className="text-gray-800 hover:text-gray-900 hover:underline"
                          title={c.name}
                        >
                          {c.name}
                        </Link>
                      )
                    }
                    if (isHeartRate) {
                      return (
                        <Link
                          key={`${c.school_content_id}-${idx}`}
                          href="/school/heart-rate"
                          className="text-gray-800 hover:text-gray-900 hover:underline"
                          title={c.name}
                        >
                          {c.name}
                        </Link>
                      )
                    }
                    if (isPaps) {
                      return (
                        <Link
                          key={`${c.school_content_id}-${idx}`}
                          href="/school/paps"
                          className="text-gray-800 hover:text-gray-900 hover:underline"
                          title={c.name}
                        >
                          {c.name}
                        </Link>
                      )
                    }
                    // 현재 컨텐츠별 상세 페이지가 없으므로, 우선 메뉴 노출 + 클릭 시 안내
                    return (
                      <button
                        key={`${c.school_content_id}-${idx}`}
                        type="button"
                        onClick={() => alert('준비 중 입니다.')}
                        className="text-gray-800 hover:text-gray-900 hover:underline"
                        title={c.name}
                      >
                        {c.name}
                      </button>
                    )
                  }).filter(Boolean)}


                  {!loadingDevices && menuDevices.map((d, idx) => {
                    const name = d.device_name.replace(/\s/g, '')
                    if (!name || name === '-' || name === ' - ') return null

                    const isExercises = name.includes('운동기록관리') || name.includes('헬스케어')
                    const isPaps = name.includes('PAPS기록관리')
                    const isHeartRate = name.includes('심박기록관리') || name.includes('하트케어') || name.includes('심박계')
                    const expired = isExpired(d)

                    if (expired) {
                      return (
                        <button
                          key={`${d.device_id}-${idx}`}
                          onClick={() => alert('기간만료 되었습니다.')}
                          className="text-gray-400 cursor-not-allowed"
                        >
                          {d.device_name}
                        </button>
                      )
                    }
                    if (isExercises) {
                      return (
                        <Link key={`${d.device_id}-${idx}`} href="/school/exercises" className="text-gray-800 hover:text-gray-900 hover:underline">
                          {d.device_name}
                        </Link>
                      )
                    }
                    if (isHeartRate) {
                      return (
                        <Link key={`${d.device_id}-${idx}`} href="/school/heart-rate" className="text-gray-800 hover:text-gray-900 hover:underline">
                          {d.device_name}
                        </Link>
                      )
                    }
                    if (isPaps) {
                      return (
                        <Link key={`${d.device_id}-${idx}`} href="/school/paps" className="text-gray-800 hover:text-gray-900 hover:underline">
                          {d.device_name}
                        </Link>
                      )
                    }
                    // 다른 디바이스는 회색 텍스트로 표시하고 클릭 시 안내 팝업
                    return (
                      <button
                        key={`${d.device_id}-${idx}`}
                        type="button"
                        onClick={() => alert('준비 중 입니다.')}
                        className="text-gray-400 cursor-pointer"
                      >
                        {d.device_name}
                      </button>
                    )
                  }).filter(Boolean)}


                  <Link
                    href="/school/settings"
                    className="text-gray-800 hover:text-gray-900 hover:underline"
                  >
                    디바이스 설정
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {schoolName && (
                  <span className="text-md font-semibold text-gray-700">{schoolName}</span>
                )}
                {isAdmin && schoolName ? (
                  <BackToAdminButton />
                ) : (
                  <AdminLogoutButton />
                )}
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </SchoolRoute>
  )
}


