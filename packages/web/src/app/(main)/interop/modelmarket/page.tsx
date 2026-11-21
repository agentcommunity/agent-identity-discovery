import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SectionHeader } from '@/components/landing/section-header';
import { ModelMarketChecks } from './modelmarket-checks';

export const metadata: Metadata = {
  title: 'ModelMarket interop test',
  description: 'Verify live AID endpoint proofs and the ARD server card for ModelMarket.',
  alternates: { canonical: '/interop/modelmarket' },
};

export default function ModelMarketInteropPage() {
  return (
    <div className="container container-padding mx-auto py-10 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <SectionHeader
          as="h1"
          title="ModelMarket interop test"
          lede="Verify AID endpoint proofs and check the MCP server card against the digest in ModelMarket’s Agent Resource Discovery (ARD) catalog."
          className="!mb-4"
        />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link
            href="https://mailarchive.ietf.org/arch/msg/dawn/OIP8iMn_X-JSh_3ZgtBARvNl3eo/"
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            IETF DAWN proposal
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
          <Link
            href="https://mailarchive.ietf.org/arch/msg/dawn/aDirdCx-wqEVap7zUtM1fUvC31Q/"
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ModelMarket’s reply
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        </div>
        <ModelMarketChecks />
      </div>
    </div>
  );
}
