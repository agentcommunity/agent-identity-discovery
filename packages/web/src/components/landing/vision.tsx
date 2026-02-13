'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Rocket, Network, ExternalLink } from 'lucide-react';
import { Reveal, RevealStagger } from './reveal';

const visionFeatures = [
  {
    icon: Network,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/30',
    dotColor: 'bg-indigo-500',
    title: 'Universal Agent Ecosystem',
    description:
      'Imagine a world where every AI service is instantly discoverable. No more hunting through documentation, no more custom integration code. Just type a domain and connect to any agent, anywhere.',
    highlights: [
      'Cross-platform interoperability',
      'Automatic capability discovery',
      'Zero-config networking',
      'Verifiable agent identity (PKA)',
    ],
  },
  {
    icon: Rocket,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-50 dark:bg-orange-950/30',
    dotColor: 'bg-orange-500',
    title: 'Open-Source Agent Infrastructure',
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
    <section className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-6xl">
          <Reveal direction="up" className="mb-12 text-center">
            <h2 className="mb-4 text-4xl md:text-5xl font-bold tracking-tight">
              The Future of AI Integration
            </h2>
            <p className="text-xl md:text-2xl leading-relaxed text-muted-foreground">
              Building the infrastructure for the next generation of AI applications
            </p>
          </Reveal>

          <RevealStagger direction="up" staggerMs={150} className="grid gap-8 md:grid-cols-2">
            {visionFeatures.map((feature, index) => (
              <Card
                key={index}
                className="card-feature shadow-soft-lg hover:shadow-soft-xl transition-all duration-300 hover:-translate-y-2 group"
              >
                <CardHeader className="pb-6">
                  <CardTitle className="text-2xl flex items-center gap-3 transition-colors duration-300 group-hover:text-foreground">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.iconBg} shadow-soft-xs transition-all duration-300 group-hover:scale-110 group-hover:shadow-soft-md`}
                    >
                      <feature.icon
                        className={`h-6 w-6 ${feature.iconColor} transition-transform duration-300 group-hover:scale-110`}
                      />
                    </div>
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-base leading-relaxed transition-colors duration-300 group-hover:text-muted-foreground/80">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {feature.highlights.map((highlight, highlightIndex) => (
                      <li
                        key={highlightIndex}
                        className="flex items-center gap-3 text-sm transition-colors duration-300 group-hover:text-muted-foreground/90"
                      >
                        <div
                          className={`h-2 w-2 rounded-full ${feature.dotColor} shadow-soft-xs transition-all duration-300 group-hover:scale-125 group-hover:shadow-soft-md`}
                        />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </RevealStagger>

          <Reveal direction="up" delay={200} className="mt-12 text-center">
            <Button
              variant="outline"
              size="lg"
              asChild
              className="group shadow-soft-md hover:shadow-soft-lg transition-all duration-300 hover:scale-105"
            >
              <Link
                href="https://github.com/agentcommunity/agent-identity-discovery/blob/main/README.md#roadmap"
                target="_blank"
              >
                View the Roadmap
                <ExternalLink className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
