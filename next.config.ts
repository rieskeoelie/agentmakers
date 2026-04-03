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
      {
        source: '/:industry((?!nl|en|es|admin|api|_next)[^/]+)',
        destination: '/nl/:industry',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
