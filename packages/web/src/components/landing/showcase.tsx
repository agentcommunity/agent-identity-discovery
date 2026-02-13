'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, ExternalLink, Languages, Hammer } from 'lucide-react';
import { Reveal, RevealStagger } from './reveal';

const toolkitPackages = [
  // Tools first
  {
    name: 'Core Engine',
    package: '@agentcommunity/aid-engine',
    description: 'Pure business logic for discovery, validation, identity',
    features: ['Discovery', 'Validation', 'Identity (PKA)'],
    href: 'https://www.npmjs.com/package/@agentcommunity/aid-engine',
    docsHref: 'https://docs.agentcommunity.org/aid/Tooling/aid_engine',
    badge: 'Stable',
    kind: 'Tool',
  },
  {
    name: 'CLI – AID Doctor',
    package: '@agentcommunity/aid-doctor',
    description: 'CLI wrapper around aid-engine: validate & generate records',
    features: ['Record linting', 'Security checks', 'JSON/YAML output'],
    href: 'https://www.npmjs.com/package/@agentcommunity/aid-doctor',
    docsHref: 'https://docs.agentcommunity.org/aid/Tooling/aid_doctor',
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
  // Languages after tools
  {
    name: 'TypeScript / JS',
    package: '@agentcommunity/aid',
    description: 'SDK for Node.js & browser',
    features: ['Promise-based API', 'TypeScript types', 'Built-in validation'],
    href: 'https://www.npmjs.com/package/@agentcommunity/aid',
    docsHref: 'https://docs.agentcommunity.org/aid/quickstart/quickstart_ts',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Go',
    package: 'github.com/agentcommunity/aid-go',
    description: 'High-performance Go client',
    features: ['Context support', 'No external deps'],
    href: 'https://pkg.go.dev/github.com/agentcommunity/aid-go',
    docsHref: 'https://docs.agentcommunity.org/aid/quickstart/quickstart_go',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Python',
    package: 'aid-discovery',
    description: 'Idiomatic Python client',
    features: ['Type hints', 'Clean API'],
    href: 'https://pypi.org/project/aid-discovery/',
    docsHref: 'https://docs.agentcommunity.org/aid/quickstart/quickstart_python',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Rust',
    package: 'packages/aid-rs',
    description: 'Idiomatic Rust client',
    features: ['Generated constants', 'Parser parity', 'Discovery support'],
    href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-rs',
    docsHref: 'https://docs.agentcommunity.org/aid/quickstart/quickstart_rust',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: 'Java',
    package: 'packages/aid-java',
    description: 'Idiomatic Java client',
    features: ['Generated constants', 'Parser parity', 'Discovery support'],
    href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-java',
    docsHref: 'https://docs.agentcommunity.org/aid/quickstart/quickstart_java',
    badge: 'Stable',
    kind: 'Language',
  },
  {
    name: '.NET',
    package: 'packages/aid-dotnet',
    description: 'C#/.NET client',
    features: ['Generated constants', 'Parser parity', 'Discovery support'],
    href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-dotnet',
    docsHref: 'https://docs.agentcommunity.org/aid/quickstart/quickstart_dotnet',
    badge: 'Stable',
    kind: 'Language',
  },
];

export function Toolkit() {
  return (
    <section className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-6xl">
          <Reveal direction="up" className="mb-12 text-center">
            <h2 className="mb-4 text-4xl md:text-5xl font-bold tracking-tight">
              Complete Developer Toolkit
            </h2>
            <p className="text-xl md:text-2xl leading-relaxed text-muted-foreground">
              Everything you need to build AID-powered applications
            </p>
          </Reveal>

          <RevealStagger
            direction="up"
            staggerMs={60}
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {toolkitPackages.map((pkg, index) => (
              <Card
                key={index}
                className="card-feature flex flex-col shadow-soft-lg hover:shadow-soft-xl transition-all duration-300 hover:-translate-y-2 group"
              >
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs flex items-center gap-1 border ${pkg.kind === 'Language' ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'}`}
                      >
                        {pkg.kind === 'Language' ? (
                          <Languages className="h-3.5 w-3.5" />
                        ) : (
                          <Hammer className="h-3.5 w-3.5" />
                        )}
                        <span>{pkg.kind}</span>
                      </Badge>
                      <Badge
                        variant={
                          pkg.badge === 'Stable'
                            ? 'success'
                            : (pkg.badge === 'Beta'
                              ? 'warning'
                              : 'default')
                        }
                        className="text-xs shadow-soft-xs transition-all duration-300 group-hover:shadow-soft-md group-hover:scale-105"
                      >
                        {pkg.badge}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-lg transition-colors duration-300 group-hover:text-foreground">
                    {pkg.name}
                  </CardTitle>
                  <div className="text-sm font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded border border-border/30 shadow-soft-xs transition-all duration-300 group-hover:bg-muted/70">
                    {pkg.package}
                  </div>
                  <CardDescription className="text-sm transition-colors duration-300 group-hover:text-muted-foreground/80">
                    {pkg.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="space-y-2 mb-6 flex-1">
                    {pkg.features.map((feature, featureIndex) => (
                      <div
                        key={featureIndex}
                        className="flex items-center gap-2 text-sm transition-colors duration-300 group-hover:text-muted-foreground/90"
                      >
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 transition-all duration-300 group-hover:scale-110" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full group-button shadow-soft hover:shadow-soft-md transition-all duration-200 hover:scale-105"
                      asChild
                    >
                      <Link
                        href={pkg.href}
                        target={pkg.href.startsWith('http') ? '_blank' : undefined}
                      >
                        {pkg.href.startsWith('/') ? 'Try Now' : 'View Package'}
                        <ExternalLink className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Link>
                    </Button>
                    {pkg.docsHref && (
                      <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
                        <a href={pkg.docsHref} target="_blank" rel="noopener noreferrer">
                          Documentation
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </RevealStagger>

          <Reveal direction="up" delay={200} className="mt-12 text-center">
            <Button
              size="lg"
              asChild
              className="shadow-soft-md hover:shadow-soft-lg transition-all duration-300 hover:scale-105"
            >
              <Link href="https://github.com/agentcommunity" target="_blank">
                <ExternalLink className="mr-2 h-5 w-5" />
                View All on GitHub
              </Link>
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
