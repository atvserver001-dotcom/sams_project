'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BackToAdminButton() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  const handleClick = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await fetch('/api/admin/act-as', {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch {}
    router.replace('/admin')
  }

  return (
    <button
      onClick={handleClick}
      disabled={submitting}
      className="bg-gray-700 hover:bg-gray-800 disabled:opacity-60 text-white px-4 py-2 rounded-md text-sm font-medium"
    >
      관리자 페이지로 이동
    </button>
  )
}


