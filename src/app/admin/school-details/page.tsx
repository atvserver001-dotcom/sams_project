'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface SchoolDetailItem {
  index: number
  name: string
  group_no: string
  teacher_accounts: number
  device_count: number
}

export default function SchoolDetailsPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<SchoolDetailItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string>('')

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      const res = await fetch(`/api/admin/school-details?${params.toString()}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '목록 조회 실패')
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e: unknown) {
      const err = e as Error
      setError(err.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    if (isAdmin) fetchList()
  }, [isAdmin, fetchList])

  const rows = useMemo(() => items.map((item) => item), [items])

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">학교 세부정보</h1>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">학교 이름</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">그룹번호</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">교사 계정</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제품 구성</th>
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
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.group_no}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.teacher_accounts}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.device_count}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/admin/act-as?group_no=${encodeURIComponent(row.group_no)}`, { credentials: 'include' })
                            const data = await res.json()
                            if (!res.ok) throw new Error(data.error || '전환 실패')
                            window.location.href = '/school'
                          } catch (e: unknown) {
                            const err = e as Error
                            alert(err.message || '전환 실패')
                          }
                        }}
                        className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                      >이동</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/80">총 {total}건 • 페이지 {page} / {Math.max(1, Math.ceil(total / pageSize))}</div>
        <div className="inline-flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/30"
          >이전</button>
          <button
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/30"
          >다음</button>
        </div>
      </div>
    </div>
  )
}


