'use client'

import React from 'react'

export const ACADEMIC_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]

export function getDefaultAcademicYear() {
  const now = new Date()
  const month = now.getMonth() + 1
  return month === 1 || month === 2 ? now.getFullYear() - 1 : now.getFullYear()
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  className = 'w-36',
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-indigo-700 mb-1">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`block ${className} h-11 px-3 rounded-lg border-2 border-indigo-200 bg-white text-sm font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300`}
      >
        {children}
      </select>
    </label>
  )
}

export function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold transition ${active ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
    >
      {children}
    </button>
  )
}

export function GradeBadge({ grade }: { grade: number | null | undefined }) {
  if (!grade) return <span className="text-gray-400">-</span>
  const classes: Record<number, string> = {
    1: 'bg-emerald-100 text-emerald-800',
    2: 'bg-blue-100 text-blue-800',
    3: 'bg-yellow-100 text-yellow-800',
    4: 'bg-orange-100 text-orange-800',
    5: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex min-w-12 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${classes[grade] ?? 'bg-gray-100 text-gray-700'}`}>
      {grade}등급
    </span>
  )
}

export function MetricCard({
  label,
  value,
  suffix,
}: {
  label: string
  value: string | number | null
  suffix?: string
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow">
      <div className="text-sm font-semibold text-gray-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-black text-gray-950">{value ?? '-'}</span>
        {suffix && value != null && <span className="text-sm font-bold text-gray-500">{suffix}</span>}
      </div>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
      {message}
    </div>
  )
}
