'use client'

import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function AdminLogoutButton() {
  const { signOut } = useAuth()
  const router = useRouter()

  const handleClick = async () => {
    await signOut()
    router.replace('/')
  }

  return (
    <button
      onClick={handleClick}
      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
    >
      로그아웃
    </button>
  )
}


