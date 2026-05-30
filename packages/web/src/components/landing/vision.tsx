'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Rocket, Network, ArrowUpRight } from 'lucide-react';
import { Reveal, RevealStagger } from './reveal';
import { SectionHeader } from './section-header';

const visionFeatures = [
  {
    icon: Network,
    title: 'A discovery layer agents can rely on',
    description:
      'When an agent meets a domain it has never seen, it can find the endpoint, learn the protocol, and verify the endpoint before connecting. No documentation hunt, no bespoke integration code.',
    highlights: [
      'Works in public or private DNS',
      'Endpoint proof with Ed25519 (PKA)',
      'Composes upward to OAuth and MCP',
      'Zero config for the client',
    ],
  },
  {
    icon: Rocket,
    title: 'Open-source agent infrastructure',
    description:
      "We're building a vendor-neutral stack for hosting, scaling and observing agents. Curious? Get involved at agentcommunity.org.",
    highlights: [
      'MIT-licensed core',
      'Self-host or cloud',
      'Token registries & open index',
      'Community governance',
    ],
  },
];

export function Vision() {
  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="Vision"
            title="Where AID fits"
            lede="A small, boring discovery layer that other systems build on."
            titleClassName="text-4xl md:text-5xl"
          />

          <RevealStagger
            direction="up"
            staggerMs={120}
            itemClassName="h-full"
            className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2"
          >
            {visionFeatures.map((feature) => (
              <div key={feature.title} className="flex h-full flex-col gap-5 bg-card p-6 md:p-8">
                <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground">
                  <feature.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
                <ul className="space-y-2">
                  {feature.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-center gap-3 text-sm text-muted-foreground"
                    >
                      <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </RevealStagger>

          <Reveal direction="up" delay={150} className="mt-10">
            <Button variant="outline" asChild>
              <Link
                href="https://github.com/agentcommunity/agent-identity-discovery/blob/main/README.md#roadmap"
                target="_blank"
              >
                View the roadmap
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
