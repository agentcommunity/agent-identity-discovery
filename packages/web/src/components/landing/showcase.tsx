'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Check, ArrowUpRight } from 'lucide-react';
import { Reveal, RevealStagger } from './reveal';
import { SectionHeader } from './section-header';

type Pkg = {
  name: string;
  package: string;
  description: string;
  features: string[];
  href: string;
  docsHref?: string;
  badge: string;
  kind: 'Tool' | 'Language';
};

const toolkitPackages: Pkg[] = [
  {
    name: 'Core Engine',
    package: '@agentcommunity/aid-engine',
    description: 'Pure business logic for discovery, validation, identity',
    features: ['Discovery', 'Validation', 'Identity (PKA)'],
    href: 'https://www.npmjs.com/package/@agentcommunity/aid-engine',
    docsHref: '/docs/Tooling/aid_engine',
    badge: 'Stable',
    kind: 'Tool',
  },
  {
    name: 'CLI – AID Doctor',
    package: '@agentcommunity/aid-doctor',
    description: 'CLI wrapper around aid-engine: validate & generate records',
    features: ['Record linting', 'Security checks', 'JSON/YAML output'],
    href: 'https://www.npmjs.com/package/@agentcommunity/aid-doctor',
    docsHref: '/docs/Tooling/aid_doctor',
    badge: 'Stable',
    kind: 'Tool',
  },
  {
    name: 'Conformance Suite',
    package: '@agentcommunity/aid-conformance',
    description: 'Golden fixtures and CLI runner for parity checks',
    features: ['Golden fixtures', 'CLI runner', 'Cross-language parity'],
    href: 'https://www.npmjs.com/package/@agentcommunity/aid-conformance',
    badge: 'Stable',
    kind: 'Tool',
  },
  {
    name: 'Web Workbench',
    package: 'Interactive tool',
    description: 'Try AID in the browser – no install',
    features: ['Live DNS lookup', 'Shareable links', 'Export configs'],
    href: '/workbench',
    badge: 'Stable',
    kind: 'Tool',
  },
  {
    name: 'Coming soon',
    package: 'more tooling',
    description: 'Open a PR',
    features: ['more tooling', 'Language support', 'New ideas'],
    href: 'https://github.com/agentcommunity/agent-identity-discovery',
    badge: 'Planned',
    kind: 'Tool',
  },
  {
    name: 'TypeScript / JS',
    package: '@agentcommunity/aid',
    description: 'SDK for Node.js & browser',
    features: ['Promise-based API', 'TypeScript types', 'Built-in validation'],
    href: 'https://www.npmjs.com/package/@agentcommunity/aid',
    docsHref: '/docs/quickstart/quickstart_ts',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Go',
    package: 'github.com/agentcommunity/aid-go',
    description: 'High-performance Go client',
    features: ['Context support', 'No external deps'],
    href: 'https://pkg.go.dev/github.com/agentcommunity/aid-go',
    docsHref: '/docs/quickstart/quickstart_go',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Python',
    package: 'aid-discovery',
    description: 'Idiomatic Python client',
    features: ['Type hints', 'Clean API'],
    href: 'https://pypi.org/project/aid-discovery/',
    docsHref: '/docs/quickstart/quickstart_python',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Rust',
    package: 'packages/aid-rs',
    description: 'Idiomatic Rust client',
    features: ['Generated constants', 'Parser parity', 'Discovery support'],
    href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-rs',
    docsHref: '/docs/quickstart/quickstart_rust',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Java',
    package: 'packages/aid-java',
    description: 'Idiomatic Java client',
    features: ['Generated constants', 'Parser parity', 'Discovery support'],
    href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-java',
    docsHref: '/docs/quickstart/quickstart_java',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: '.NET',
    package: 'packages/aid-dotnet',
    description: 'C#/.NET client',
    features: ['Generated constants', 'Parser parity', 'Discovery support'],
    href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-dotnet',
    docsHref: '/docs/quickstart/quickstart_dotnet',
    badge: 'Stable',
    kind: 'Language',
  },
];

export function Toolkit() {
  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Tooling"
            title="Developer toolkit"
            lede="SDKs in six languages, a CLI, a conformance suite, and a browser workbench."
          />

          <RevealStagger
            direction="up"
            staggerMs={50}
            className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-3"
          >
            {toolkitPackages.map((pkg) => (
              <div key={pkg.name} className="flex flex-col gap-4 bg-card p-6">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider">
                  <span className="text-muted-foreground/60">{pkg.kind}</span>
                  {pkg.badge === 'Stable' ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {pkg.badge}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">{pkg.badge}</span>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-semibold text-foreground">{pkg.name}</h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground/70">{pkg.package}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pkg.description}
                  </p>
                </div>

                <ul className="flex-1 space-y-1.5">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col gap-1.5">
                  <Button variant="outline" size="sm" asChild className="justify-between">
                    <Link
                      href={pkg.href}
                      target={pkg.href.startsWith('http') ? '_blank' : undefined}
                    >
                      {pkg.href.startsWith('/') ? 'Try now' : 'View package'}
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  {pkg.docsHref ? (
                    <Button variant="ghost" size="sm" asChild className="text-xs">
                      <Link href={pkg.docsHref}>Documentation</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </RevealStagger>

          <Reveal direction="up" delay={150} className="mt-10">
            <Button variant="outline" asChild>
              <Link href="https://github.com/agentcommunity" target="_blank">
                View all on GitHub
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
