import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/tech',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
