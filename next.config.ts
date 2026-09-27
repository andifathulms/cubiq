import type { NextConfig } from 'next'

// GitHub Pages serves the static export from /<repo>/; the deploy workflow
// sets PAGES_BASE_PATH=/cubiq. Local dev/builds stay at the root.
const basePath = process.env.PAGES_BASE_PATH || ''

const nextConfig: NextConfig = {
  // Fully static site — every solver runs in the browser (Web Worker)
  output: 'export',
  basePath,
  // /stats/ -> stats/index.html, which static hosts resolve without rewrites
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['cubing'],
  // cubing.js uses new Worker(new URL(..., import.meta.url)) — webpack needs
  // globalObject:'self' so the worker chunk can reference its own global scope.
  webpack(config, { isServer }) {
    if (!isServer) {
      config.output.globalObject = 'self'
    }
    return config
  },
  // Silence the "webpack config present but no turbopack config" warning.
  turbopack: {},
}

export default nextConfig
