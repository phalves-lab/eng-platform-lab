import { resolve } from 'node:path'
import type { NextConfig } from 'next'

const standalone = process.env.PORTAL_WEB_STANDALONE === 'true'

const config: NextConfig = {
  ...(standalone
    ? { output: 'standalone', outputFileTracingRoot: resolve(process.cwd(), '../..') }
    : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  productionBrowserSourceMaps: false,
  transpilePackages: ['@lab/contracts'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = { '.js': ['.ts', '.js'] }
    return webpackConfig
  },
}

export default config
