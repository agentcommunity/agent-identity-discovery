'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Codeblock } from '@/components/ui/codeblock';
import { ShieldCheck } from 'lucide-react';
import { Reveal } from './reveal';

const TXT_PKA_SNIPPET = `_agent.example.com. 300 IN TXT \
  "v=aid1;\\\n  u=https://api.example.com/mcp;\\\n  p=mcp;\\\n  k=z7rW8rTq8o4mM6vVf7w1k3m4uQn9p2YxCAbcDeFgHiJ;\\\n  i=g1"`;

export function Identity() {
  return (
    <section className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-6xl">
          <Reveal direction="up" className="mb-12 text-center">
            <h2 className="mb-4 text-4xl md:text-5xl font-bold tracking-tight">Identity (PKA)</h2>
            <p className="text-xl md:text-2xl leading-relaxed text-muted-foreground">
              Public Key for Agents: verify that you are connecting to the right endpoint.
            </p>
          </Reveal>

          <Reveal direction="up" delay={150}>
            <Card className="card-feature shadow-soft-lg hover:shadow-soft-xl transition-all duration-300">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                    <ShieldCheck className="h-6 w-6 text-emerald-600" />
                  </span>
                  How it works
                </CardTitle>
                <CardDescription>
                  PKA adds a public key (`k`) and a key id (`i`) to your `_agent` TXT record.
                  Clients send a small challenge and verify an HTTP signature from your server using
                  that key.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 text-sm leading-relaxed">
                    <p className="text-muted-foreground">
                      In short: DNS tells clients where to connect; Identity (PKA) lets clients
                      verify who is on the other end. All keys have single-letter aliases for byte
                      efficiency (e.g. <code>u</code> for <code>uri</code>, <code>p</code> for{' '}
                      <code>proto</code>
                      ).
                    </p>
                    <ul className="space-y-2 list-disc pl-5">
                      <li>Publish `k` (public key) and `i` (key id) in your TXT record</li>
                      <li>Client sends an `AID-Challenge` to your `uri`</li>
                      <li>Server returns an HTTP signature (Ed25519) covering the request</li>
                      <li>Client verifies the signature using `k`</li>
                    </ul>
                    <div>
                      <Button variant="outline" asChild>
                        <Link href="/docs/Reference/identity_pka">Learn more</Link>
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Codeblock title="txt" content={TXT_PKA_SNIPPET} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
