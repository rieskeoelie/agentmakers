'use client'
import { useEffect } from 'react'
import type { Lang } from '@/lib/i18n'

export function TrackView({ slug, lang }: { slug: string; lang: Lang }) {
  useEffect(() => {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, language: lang }),
    }).catch(() => {}) // Silent fail
  }, [slug, lang])
  return null
}
