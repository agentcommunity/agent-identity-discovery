import type { Metadata } from 'next';
import { ModelMarketChecks } from './modelmarket-checks';

export const metadata: Metadata = {
  title: 'ModelMarket interop test',
  description: 'Verify live AID endpoint proofs and the ARD server card for ModelMarket.',
  alternates: { canonical: '/interop/modelmarket' },
};

export default function ModelMarketInteropPage() {
  return (
    <div className="container max-w-4xl py-10 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        ModelMarket interop test
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Verify AID endpoint proofs and check the MCP server card against the digest in ModelMarket’s
        Agent Resource Discovery (ARD) catalog.
      </p>
      <ModelMarketChecks />
    </div>
  );
}
