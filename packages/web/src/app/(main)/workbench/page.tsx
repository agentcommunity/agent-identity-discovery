import type { Metadata } from 'next';
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
  return <WorkbenchClient />;
}
