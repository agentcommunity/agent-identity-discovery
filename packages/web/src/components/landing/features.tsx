'use client';

import { AlertTriangle, Puzzle, Clock, Settings } from 'lucide-react';
import { RevealStagger } from './reveal';
import { SectionHeader } from './section-header';

const problems = [
  {
    icon: AlertTriangle,
    title: 'Manual integration hell',
    description: 'Every new system means bespoke code, doc digging, and manual config.',
  },
  {
    icon: Puzzle,
    title: 'Protocol fragmentation',
    description: 'Agents speak MCP, A2A, OpenAPI and more. Auth flows vary wildly.',
  },
  {
    icon: Clock,
    title: 'Wasted development time',
    description: 'Teams lose weeks wiring basic discovery and connection logic.',
  },
  {
    icon: Settings,
    title: 'No discovery or identity standard',
    description: 'No universal way to find an endpoint and verify who runs it.',
  },
];

export function Problem() {
  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="The problem"
            title="The integration problem"
            lede="An agent reaching a new system shouldn't need a PhD in API archaeology."
          />

          <RevealStagger
            direction="up"
            staggerMs={80}
            className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2"
          >
            {problems.map((problem, index) => (
              <div
                key={index}
                className="flex gap-4 bg-card p-6 transition-colors duration-200 hover:bg-muted/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                  <problem.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{problem.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {problem.description}
                  </p>
                </div>
              </div>
            ))}
          </RevealStagger>
        </div>
      </div>
    </section>
  );
}
