import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'

export const metadata: Metadata = {
  title: 'agentmakers.io — AI Agents voor elk bedrijf',
  description: 'AI agents die uw telefoon beantwoorden, afspraken boeken en klanten helpen. 24/7, in elke branche.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://agentmakers.io'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
