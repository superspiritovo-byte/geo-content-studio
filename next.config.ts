import type { NextConfig } from 'next';
const config: NextConfig = { distDir: process.env.GEO_BUILD_DIR || ".next", turbopack: { root: process.cwd() }, serverExternalPackages: ['playwright', 'mammoth'], experimental: { proxyClientMaxBodySize: '85mb' } };
export default config;
