'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copybutton';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';

const RECORD_NAME = '_agent.example.com';
const RECORD_VALUE =
  'v=aid1;u=https://api.example.com/mcp;p=mcp;k=z7rW8rTq8o4mM6vVf7w1k3m4uQn9p2YxCAbcDeFgHiJ;i=g1';
const RECORD_VALUE_DISPLAY =
  'v=aid1;u=https://api.example.com/mcp;p=mcp;k=z7rW8rTq8o4mM6vVf7w…;i=g1';
const RECORD_FULL = `${RECORD_NAME}. 300 IN TXT "${RECORD_VALUE}"`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3 bg-muted/50 px-4 py-3">
      <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd className="break-all font-mono text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function Identity() {
  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="Identity"
            title="Public key for agents"
            lede="DNS tells a client where to connect. PKA lets it verify who is on the other end."
          />

          <Reveal direction="up" delay={120}>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid gap-px bg-border md:grid-cols-2">
                {/* explanation */}
                <div className="space-y-5 bg-card p-6 md:p-8">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
                      How it works
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Keys use single-letter aliases for byte efficiency (<code>u</code> for{' '}
                    <code>uri</code>, <code>p</code> for <code>proto</code>).
                  </p>

                  <ol className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                    <li className="flex gap-3">
                      <span className="font-mono text-xs text-muted-foreground/50">1</span>
                      <span>
                        Publish <code>k</code> (public key) and <code>i</code> (key id) in your TXT
                        record
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-xs text-muted-foreground/50">2</span>
                      <span>
                        Client sends an <code>AID-Challenge</code> to your <code>uri</code>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-xs text-muted-foreground/50">3</span>
                      <span>Server returns an HTTP signature (Ed25519) covering the request</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-xs text-muted-foreground/50">4</span>
                      <span>
                        Client verifies the signature using <code>k</code>
                      </span>
                    </li>
                  </ol>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                    <Button variant="outline" asChild>
                      <Link href="/docs/Reference/identity_pka">Learn more</Link>
                    </Button>
                    <Link
                      href="https://agentcommunity.org/blog/external_identity_anchor"
                      target="_blank"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      PKA as an external trust anchor
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {/* structured DNS record */}
                <div className="bg-card p-6 md:p-8">
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
                      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        DNS record
                      </span>
                      <CopyButton textToCopy={RECORD_FULL} />
                    </div>
                    <dl className="divide-y divide-border">
                      <Field label="Name">{RECORD_NAME}</Field>
                      <Field label="Type">
                        TXT <span className="text-muted-foreground/50">· TTL 300</span>
                      </Field>
                      <Field label="Value">{RECORD_VALUE_DISPLAY}</Field>
                    </dl>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground/70">
                    One TXT record at the <code>_agent</code> subdomain. The same shape your DNS
                    provider already understands.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
