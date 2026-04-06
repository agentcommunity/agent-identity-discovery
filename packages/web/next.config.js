const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare');

initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  redirects: async () => {
    return [
      // Case-insensitive redirects: lowercase → canonical case
      {
        source: '/docs/understand/:slug*',
        destination: '/docs/Understand/:slug*',
        permanent: true,
      },
      { source: '/docs/reference/:slug*', destination: '/docs/Reference/:slug*', permanent: true },
      { source: '/docs/tooling/:slug*', destination: '/docs/Tooling/:slug*', permanent: true },
      // Section index → first page in section (canonical + lowercase)
      { source: '/docs/Understand', destination: '/docs/Understand/concepts', permanent: false },
      { source: '/docs/understand', destination: '/docs/Understand/concepts', permanent: false },
      { source: '/docs/Reference', destination: '/docs/Reference/protocols', permanent: false },
      { source: '/docs/reference', destination: '/docs/Reference/protocols', permanent: false },
      { source: '/docs/Tooling', destination: '/docs/Tooling/aid_doctor', permanent: false },
      { source: '/docs/tooling', destination: '/docs/Tooling/aid_doctor', permanent: false },
      // Friendly SDK slugs → actual filenames (302 while doc structure evolves)
      {
        source: '/docs/quickstart/typescript',
        destination: '/docs/quickstart/quickstart_ts',
        permanent: false,
      },
      {
        source: '/docs/quickstart/ts',
        destination: '/docs/quickstart/quickstart_ts',
        permanent: false,
      },
      {
        source: '/docs/quickstart/go',
        destination: '/docs/quickstart/quickstart_go',
        permanent: false,
      },
      {
        source: '/docs/quickstart/python',
        destination: '/docs/quickstart/quickstart_python',
        permanent: false,
      },
      {
        source: '/docs/quickstart/py',
        destination: '/docs/quickstart/quickstart_python',
        permanent: false,
      },
      {
        source: '/docs/quickstart/rust',
        destination: '/docs/quickstart/quickstart_rust',
        permanent: false,
      },
      {
        source: '/docs/quickstart/rs',
        destination: '/docs/quickstart/quickstart_rust',
        permanent: false,
      },
      {
        source: '/docs/quickstart/java',
        destination: '/docs/quickstart/quickstart_java',
        permanent: false,
      },
      {
        source: '/docs/quickstart/dotnet',
        destination: '/docs/quickstart/quickstart_dotnet',
        permanent: false,
      },
      {
        source: '/docs/quickstart/csharp',
        destination: '/docs/quickstart/quickstart_dotnet',
        permanent: false,
      },
      {
        source: '/docs/quickstart/browser',
        destination: '/docs/quickstart/quickstart_browser',
        permanent: false,
      },
      {
        source: '/docs/quickstart/mcp',
        destination: '/docs/quickstart/quickstart_mcp',
        permanent: false,
      },
      {
        source: '/docs/quickstart/a2a',
        destination: '/docs/quickstart/quickstart_a2a',
        permanent: false,
      },
      {
        source: '/docs/quickstart/openapi',
        destination: '/docs/quickstart/quickstart_openapi',
        permanent: false,
      },
    ];
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
