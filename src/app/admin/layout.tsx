import React from 'react'
import AdminRoute from '@/components/AdminRoute'
import Link from 'next/link'
import AdminLogoutButton from '@/components/AdminLogoutButton'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRoute>
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800">
        <nav className="bg-white/90 backdrop-blur border-b border-white/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center space-x-6">
                <span className="text-lg font-semibold text-gray-900">관리자 페이지</span>
                <div className="flex items-center ml-10 gap-6 md:gap-8 text-sm font-medium">
                  <Link href="/admin/accounts" className="text-gray-800 hover:text-gray-900 hover:underline">계정관리</Link>
                  <span className="text-gray-300">|</span>
                  <Link href="/admin/schools" className="text-gray-800 hover:text-gray-900 hover:underline">학교관리</Link>
                  <span className="text-gray-300">|</span>
                  <Link href="/admin/school-details" className="text-gray-800 hover:text-gray-900 hover:underline">학교세부정보</Link>
                  <span className="text-gray-300">|</span>
                  <Link href="/admin/devices" className="text-gray-800 hover:text-gray-900 hover:underline">디바이스 관리</Link>
                </div>
              </div>
              <div className="flex items-center">
                <AdminLogoutButton />
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </AdminRoute>
  )
}


