'use client'
import { useEffect, useState, type ReactNode } from 'react'

export function OrbColumn({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const hide = () => setHidden(true)
    window.addEventListener('form:success', hide)
    return () => window.removeEventListener('form:success', hide)
  }, [])

  if (hidden) return null

  return <>{children}</>
}
