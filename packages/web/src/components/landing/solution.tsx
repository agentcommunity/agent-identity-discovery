'use client';

import Link from 'next/link';
import { Globe, Zap, Layers, ShieldCheck } from 'lucide-react';
import { RevealStagger } from './reveal';
import { SectionHeader } from './section-header';

type SolutionItem = {
  n: string;
  icon: typeof Globe;
  title: string;
  description: string;
  links: Array<{ label: string; href: string }>;
  badges?: string[];
  accent?: boolean;
};

const solutions: SolutionItem[] = [
  {
    n: '01',
    icon: Globe,
    title: 'One DNS TXT record',
    description:
      'Add a single _agent.example.com TXT record. No registries, no APIs, no complexity.',
    links: [
      { label: 'Quick Start', href: '/docs/quickstart' },
      { label: 'Specification', href: '/docs/specification' },
    ],
  },
  {
    n: '02',
    icon: Zap,
    title: 'Instant discovery',
    description:
      'Any client resolves the _agent subdomain to your endpoint. Falls back to .well-known/agent when DNS is restricted.',
    links: [
      { label: 'Discovery API', href: '/docs/reference/discovery_api' },
      { label: 'Troubleshooting', href: '/docs/reference/troubleshooting' },
    ],
  },
  {
    n: '03',
    icon: Layers,
    title: 'Protocol-agnostic',
    description: 'Works with any agent protocol. Change the p= token in your record.',
    badges: ['mcp', 'a2a', 'openapi', 'grpc', 'graphql', 'websocket', 'ucp'],
    links: [
      { label: 'MCP Guide', href: '/docs/quickstart/quickstart_mcp' },
      { label: 'A2A Guide', href: '/docs/quickstart/quickstart_a2a' },
      { label: 'Protocols', href: '/docs/reference/protocols' },
    ],
  },
  {
    n: '04',
    icon: ShieldCheck,
    title: 'Agent identity',
    description:
      'Publish a public key (PKA) and let clients verify your endpoint with HTTP Message Signatures (Ed25519).',
    accent: true,
    links: [
      { label: 'Identity & PKA', href: '/docs/reference/identity_pka' },
      { label: 'Security', href: '/docs/reference/security' },
    ],
  },
];

export function Solution() {
  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="The solution"
            title="How AID solves it"
            lede="One DNS record. Discovery, protocol, and endpoint proof."
          />

          <RevealStagger
            direction="up"
            staggerMs={80}
            itemClassName="h-full"
            className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-4"
          >
            {solutions.map((solution) => (
              <div
                key={solution.n}
                className="flex h-full flex-col gap-5 bg-card p-6 transition-colors duration-200 hover:bg-muted/40"
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-md border border-border ${
                      solution.accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                    }`}
                  >
                    <solution.icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-sm font-medium text-muted-foreground/60">
                    {solution.n}
                  </span>
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-semibold leading-snug text-foreground">
                    {solution.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {solution.description}
                  </p>
                  {solution.badges ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {solution.badges.map((b) => (
                        <span
                          key={b}
                          className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {solution.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </RevealStagger>
        </div>
      </div>
    </section>
  );
}
