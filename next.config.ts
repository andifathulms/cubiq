import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
