import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async redirects() {
    return [
      // /klinieken → /nl/klinieken (default to Dutch)
      // Exclude static files (with extensions), api, _next, admin, and known locales
      {
        source: '/:industry((?!nl|en|es|admin|api|_next|favicon|privacy|voorwaarden)[^/.]+)',
        destination: '/nl/:industry',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
