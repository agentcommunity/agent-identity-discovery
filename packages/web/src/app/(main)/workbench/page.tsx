import type { Metadata } from 'next';
import Link from 'next/link';
import { WorkbenchClient } from './workbench-client';

export const metadata: Metadata = {
  title: 'Workbench',
  description:
    'Interactive AID resolver and record generator. Discover agent endpoints and validate DNS TXT records.',
  alternates: {
    canonical: '/workbench',
  },
  openGraph: {
    title: 'AID Workbench — Resolver & Generator',
    description:
      'Discover agent endpoints and generate valid AID records from one interactive workbench.',
    url: '/workbench',
  },
};

export default function WorkbenchPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="container flex justify-end py-2">
        <Link
          href="/interop/modelmarket"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ModelMarket interop test
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <WorkbenchClient />
      </div>
    </div>
  );
}
