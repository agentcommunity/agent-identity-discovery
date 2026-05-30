'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Codeblock } from '@/components/ui/codeblock';
import { ShieldCheck } from 'lucide-react';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';

const TXT_PKA_SNIPPET = `_agent.example.com. 300 IN TXT \
  "v=aid1;\\\n  u=https://api.example.com/mcp;\\\n  p=mcp;\\\n  k=z7rW8rTq8o4mM6vVf7w1k3m4uQn9p2YxCAbcDeFgHiJ;\\\n  i=g1"`;

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

                  <Button variant="outline" asChild>
                    <Link href="/docs/Reference/identity_pka">Learn more</Link>
                  </Button>
                </div>

                {/* record */}
                <div className="bg-card p-6 md:p-8">
                  <Codeblock title="txt" content={TXT_PKA_SNIPPET} />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
