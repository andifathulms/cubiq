import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['cubing'],
  // Silence the "webpack config present but no turbopack config" warning.
  // cubing.js workers are correctly bundled by webpack (dev) and
  // served as static assets by Turbopack (build).
  turbopack: {},
}

export default nextConfig
