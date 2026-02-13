import type { Metadata } from 'next';
import { Hero } from '@/components/landing/hero';
import { QuickStart } from '@/components/landing/quick-start';
import { RecordStrip } from '@/components/landing/record-strip';
import { Problem } from '@/components/landing/features';
import { Solution } from '@/components/landing/solution';
import { Toolkit } from '@/components/landing/showcase';
import { Vision } from '@/components/landing/vision';
import { Identity } from '@/components/landing/identity';
import { Footer } from '@/components/layout/footer';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/seo';

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
  },
};

export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />
      <RecordStrip />
      <QuickStart />
      <Problem />
      <Solution />
      <Identity />
      <Toolkit />
      <Vision />
      <Footer />
    </div>
  );
}
