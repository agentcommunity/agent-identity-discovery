'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Zap, Layers, ShieldCheck } from 'lucide-react';
import { Reveal, RevealStagger } from './reveal';

const solutions: Array<{
  number: string;
  icon: typeof Globe;
  title: string;
  description: string;
  iconColor: string;
  iconBg: string;
  links: Array<{ label: string; href: string }>;
  badges?: string[];
}> = [
  {
    number: '1',
    icon: Globe,
    title: 'One DNS TXT Record',
    description:
      "Add a single _agent.example.com TXT record. That's it. No registries, no APIs, no complexity.",
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50 dark:bg-blue-950/30',
    links: [
      { label: 'Quick Start', href: '/docs/quickstart' },
      { label: 'Specification', href: '/docs/specification' },
    ],
  },
  {
    number: '2',
    icon: Zap,
    title: 'Instant Discovery',
    description:
      'Any tool can find your agent by looking up the _agent subdomain. Falls back to .well-known/agent when DNS is restricted.',
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50 dark:bg-amber-950/30',
    links: [
      {
        label: 'Discovery API',
        href: '/docs/Reference/discovery_api',
      },
      {
        label: 'Troubleshooting',
        href: '/docs/Reference/troubleshooting',
      },
    ],
  },
  {
    number: '3',
    icon: Layers,
    title: 'Protocol-Agnostic',
    description: 'Works with any agent protocol — just change the p= token in your record.',
    badges: ['mcp', 'a2a', 'openapi', 'grpc', 'graphql', 'websocket', 'ucp'],
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-50 dark:bg-purple-950/30',
    links: [
      { label: 'MCP Guide', href: '/docs/quickstart/quickstart_mcp' },
      { label: 'A2A Guide', href: '/docs/quickstart/quickstart_a2a' },
      {
        label: 'OpenAPI Guide',
        href: '/docs/quickstart/quickstart_openapi',
      },
      { label: 'Protocols', href: '/docs/Reference/protocols' },
    ],
  },
  {
    number: '4',
    icon: ShieldCheck,
    title: 'Agent Identity',
    description:
      'Publish a public key (PKA) and let clients verify your endpoint using HTTP Message Signatures (Ed25519).',
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    links: [
      {
        label: 'Identity & PKA',
        href: '/docs/Reference/identity_pka',
      },
      { label: 'Security', href: '/docs/Reference/security' },
    ],
  },
];

export function Solution() {
  return (
    <section className="section-padding">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-6xl">
          <Reveal direction="up" className="mb-12 text-center">
            <h2 className="mb-4 text-4xl md:text-5xl font-bold tracking-tight">
              How <span className="text-gradient">Agent Discovery</span> Solves This
            </h2>
            <p className="text-xl md:text-2xl leading-relaxed text-muted-foreground">
              Four core principles that eliminate integration complexity
            </p>
          </Reveal>

          <RevealStagger
            direction="up"
            staggerMs={120}
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
          >
            {solutions.map((solution, index) => (
              <Card
                key={index}
                className="card-feature relative overflow-hidden shadow-soft-lg hover:shadow-soft-xl transition-all duration-300 hover:-translate-y-2 group"
              >
                <div className="absolute top-4 right-4 text-8xl font-bold text-muted-foreground/10 select-none transition-all duration-300 group-hover:text-muted-foreground/20 group-hover:scale-110">
                  {solution.number}
                </div>
                <CardHeader className="pb-4 relative z-10">
                  <div
                    className={`w-12 h-12 ${solution.iconBg} rounded-xl flex items-center justify-center ${solution.iconColor} mb-4 shadow-soft-xs transition-all duration-300 group-hover:scale-110 group-hover:shadow-soft-md`}
                  >
                    <solution.icon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <CardTitle className="text-xl transition-colors duration-300 group-hover:text-foreground">
                    {solution.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                  <CardDescription className="text-base leading-relaxed transition-colors duration-300 group-hover:text-muted-foreground/80">
                    {solution.description}
                  </CardDescription>
                  {solution.badges && solution.badges.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {solution.badges.map((b) => (
                        <span
                          key={b}
                          className="inline-block text-xs font-mono bg-muted px-2 py-0.5 rounded-md border border-border/50 transition-colors duration-200 group-hover:bg-muted/80"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                  {solution.links && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {solution.links.map((link, linkIndex) => (
                        <Link
                          key={linkIndex}
                          href={link.href}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors duration-200 underline decoration-1 underline-offset-2"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </RevealStagger>
        </div>
      </div>
    </section>
  );
}
