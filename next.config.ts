import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: '.next',
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  serverExternalPackages: ['stripe'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' }
    ] }];
  }
};
export default config;
