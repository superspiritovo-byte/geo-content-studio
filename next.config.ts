import type { NextConfig } from 'next';
const config: NextConfig = { turbopack: { root: process.cwd() }, serverExternalPackages: ['playwright', 'mammoth'], experimental: { proxyClientMaxBodySize: '85mb' } };
export default config;
