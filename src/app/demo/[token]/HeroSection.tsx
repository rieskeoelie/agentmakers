'use client'
import { useEffect, useState } from 'react'

interface Props {
  eyebrow: string
  headline: string
  sub: string
}

export function HeroSection({ eyebrow, headline, sub }: Props) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const hide = () => setHidden(true)
    window.addEventListener('demo:ended', hide)
    return () => window.removeEventListener('demo:ended', hide)
  }, [])

  if (hidden) return null

  return (
    <div className="hero">
      <div className="eyebrow">
        <span className="eyebrow-dot" />
        {eyebrow}
      </div>
      <h1 className="headline">{headline}</h1>
      <p className="hero-sub">{sub}</p>
    </div>
  )
}
