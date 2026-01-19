'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

export default function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const [rememberId, setRememberId] = useState(false)
  const router = useRouter()
  
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saved_username')
      if (saved) {
        setUsername(saved)
        setRememberId(true)
      }
    } catch {
      // noop: localStorage unavailable
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!username || !password) {
      setError('아이디와 비밀번호를 모두 입력해주세요.')
      setLoading(false)
      return
    }

    try {
      const { error: signInError, user } = await signIn(username, password)
      
      if (signInError) {
        setError(signInError)
      } else {
        // 역할별 자동 이동
        if (user?.role === 'admin') {
          router.replace('/admin')
        } else if (user?.role === 'school') {
          router.replace('/school')
        }
        try {
          if (rememberId) {
            localStorage.setItem('saved_username', username)
          } else {
            localStorage.removeItem('saved_username')
          }
        } catch {
          // noop: localStorage unavailable
        }
      }
    } catch {
      setError('오류가 발생했습니다. 다시 시도해주세요.')
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 py-12 px-4 sm:px-6 lg:px-8">
      <a
        href="https://spopark.kr/"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-4 right-4 inline-flex items-center gap-2 rounded-lg bg-white/90 text-gray-800 hover:bg-white px-4 py-2 text-sm font-semibold shadow-md border border-gray-200"
      >
        홈페이지
        <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
      </a>
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-8">
          <div>
            <div className="flex justify-center">
              <Image
                src="/image/logo_atv.svg?v=202020"
                alt="스포파크 로고"
                width={240}
                height={72}
                className="h-12 w-auto md:h-14"
                style={{ color: 'rgba(32, 32, 32, 0)' }}
                priority
              />
            </div>
            <p className="mt-8 text-center text-lg font-semibold text-gray-700">
              학교 운동 관리 시스템
            </p>
            
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  아이디
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-150"
                  placeholder="아이디를 입력하세요"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-150"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-left">
              <input
                id="rememberId"
                name="rememberId"
                type="checkbox"
                checked={rememberId}
                onChange={(e) => setRememberId(e.target.checked)}
                className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
              />
              <label htmlFor="rememberId" className="ml-3 block text-sm text-gray-900">
                아이디 기억하기
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 shadow-lg"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </div>
          </form>
        </div>
        
        <p className="mt-6 text-center text-xs text-white/80">
          © 2025 AllThatVision. All rights reserved.
        </p>
      </div>
    </div>
  )
}
