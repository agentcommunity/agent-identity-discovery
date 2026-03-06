/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  output: 'standalone',
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'interest-cohort=(), camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // Watch packages/docs for HMR during development
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '!**/packages/docs/**'],
    };
    return config;
  },
};

module.exports = nextConfig;
