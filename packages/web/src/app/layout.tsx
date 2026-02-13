import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import {
  getMetadataBase,
  getSiteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_X_HANDLE,
} from '@/lib/seo';
import './globals.css';

const geistSans = GeistSans;
const geistMono = GeistMono;
const siteUrl = getSiteUrl();
const metadataBase = getMetadataBase();

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  metadataBase,
  alternates: {
    canonical: '/',
  },
  keywords: [
    'agent identity',
    'agent discovery',
    'agent discovery protocol',
    'agent discovery standard',
    'dns agent discovery',
    'dns txt records',
    'agent endpoints',
    'AI agents',
    'AID',
    'MCP',
    'A2A',
  ],
  authors: [{ name: 'Agent Community' }],
  creator: 'Agent Community',
  publisher: 'Agent Community',
  category: 'technology',
  referrer: 'origin-when-cross-origin',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    images: [
      {
        url: '/og-card.png',
        width: 1200,
        height: 630,
        alt: 'Agent Identity & Discovery',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: SITE_X_HANDLE,
    creator: SITE_X_HANDLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og-card.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: siteUrl,
  logo: `${siteUrl}/logo/agent.png`,
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: siteUrl,
  description: SITE_DESCRIPTION,
  inLanguage: 'en-US',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.className} ${geistMono.variable} min-h-dvh bg-background text-foreground antialiased`}
      >
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
