import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import AdminApp from '@/components/admin/app/AdminApp'
import '@/components/admin/ds/admin.css'

const inter = Inter({ subsets: ['latin'], variable: '--am-font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'AgentMakers admin',
  robots: { index: false, follow: false },
}

/**
 * The admin is one client application (AdminApp) with a persistent shell; the URL selects the screen.
 * The catch-all page below renders nothing, so the shell and its loaded data survive navigation.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`am-root ${inter.variable}`}>
      <AdminApp />
      {children}
    </div>
  )
}
