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
      // Section index → first page in section (canonical + lowercase)
      { source: '/docs/Understand', destination: '/docs/understand/concepts', permanent: false },
      { source: '/docs/understand', destination: '/docs/understand/concepts', permanent: false },
      { source: '/docs/Reference', destination: '/docs/reference/protocols', permanent: false },
      { source: '/docs/reference', destination: '/docs/reference/protocols', permanent: false },
      { source: '/docs/Tooling', destination: '/docs/tooling/aid_doctor', permanent: false },
      { source: '/docs/tooling', destination: '/docs/tooling/aid_doctor', permanent: false },
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
    // Baseline Content-Security-Policy. The workbench is a Next.js app, so it
    // needs inline + eval'd bootstrap scripts and inline styles; 'unsafe-inline'
    // / 'unsafe-eval' are therefore required here (a nonce-based policy would
    // need middleware wiring we don't have). This is still meaningful
    // defense-in-depth: it pins object-src/base-uri, blocks framing
    // (frame-ancestors 'none', mirroring X-Frame-Options), and constrains
    // default-src to same-origin. img/font/connect are widened only as far as
    // the app actually needs (data: URIs, same-origin API calls, https images).
    const contentSecurityPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

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
          {
            // HSTS: force HTTPS for two years incl. subdomains, with preload.
            // The site is HTTPS-only (Cloudflare edge); this in-repo header makes
            // the policy explicit rather than relying solely on dashboard config.
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
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
