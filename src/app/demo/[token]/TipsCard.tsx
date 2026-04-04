'use client'
import { useEffect, useState } from 'react'

interface Props {
  title: string
  tips: string[]
  note: string
}

export function TipsCard({ title, tips, note }: Props) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const hide = () => setHidden(true)
    window.addEventListener('demo:ended', hide)
    return () => window.removeEventListener('demo:ended', hide)
  }, [])

  if (hidden) return null

  return (
    <div className="tips-card">
      <div className="tips-title">{title}</div>
      <div className="tips-list">
        {tips.map((tip, i) => (
          <div key={i} className="tip-item">
            <span className="tip-icon">✓</span>
            <span>{tip}</span>
          </div>
        ))}
      </div>
      <p className="tips-note">
        <i className="tips-note-icon">📅</i>
        {note}
      </p>
    </div>
  )
}
