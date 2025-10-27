'use client'
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SchoolRoute from '@/components/SchoolRoute'
import AdminLogoutButton from '@/components/AdminLogoutButton'
import { useAuth } from '@/contexts/AuthContext'
import BackToAdminButton from '@/components/BackToAdminButton'

type SchoolDevice = {
  device_id: string
  device_name: string
  start_date: string | null
  end_date: string | null
  limited_period: boolean
}

function isExpired(d: SchoolDevice): boolean {
  if (!d.limited_period) return false
  if (!d.end_date) return false
  // 종료일 23:59:59 기준 만료 처리
  const end = new Date(`${d.end_date}T23:59:59`)
  const now = new Date()
  return end.getTime() < now.getTime()
}

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { schoolName, isAdmin } = useAuth()
  const [devices, setDevices] = useState<SchoolDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)

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

  const menuDevices = useMemo(() => devices, [devices])
  return (
    <SchoolRoute>
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800">
        <nav className="bg-white/90 backdrop-blur border-b border-white/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center space-x-6">
                <span className="text-lg font-semibold text-gray-900">운영툴</span>
                <div className="flex items-center ml-10 gap-6 md:gap-8 text-sm font-medium">
                  <Link href="/school/students" className="text-gray-800 hover:text-gray-900 hover:underline">학생 정보입력</Link>
                  {menuDevices.length > 0 && <span className="text-gray-300">|</span>}
                  {!loadingDevices && menuDevices.map((d, idx) => {
                    const expired = isExpired(d)
                    const isExercises = d.device_name === '운동기록관리'
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
                  }).flatMap((node, i, arr) => i < arr.length - 1 ? [node, <span key={`sep-${i}`} className="text-gray-300">|</span>] : [node])}
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


