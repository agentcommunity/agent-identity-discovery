'use client';

import { Flame, ShieldAlert, Puzzle, Compass } from 'lucide-react';
import { RevealStagger } from './reveal';
import { SectionHeader } from './section-header';

const problems = [
  {
    icon: Flame,
    title: 'Agents burn tokens guessing',
    description:
      'With no map, an agent retries dead endpoints and scrapes docs just to find the way in.',
  },
  {
    icon: ShieldAlert,
    title: 'No way to verify the endpoint',
    description: 'Nothing proves the server an agent reached is the one the domain intended.',
  },
  {
    icon: Puzzle,
    title: 'Protocol guesswork',
    description: 'MCP? A2A? OpenAPI? The agent has to probe, or be told out of band.',
  },
  {
    icon: Compass,
    title: 'No discovery standard',
    description: 'Every agent-to-system link is hand-wired, one integration at a time.',
  },
];

export function Problem() {
  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="The problem"
            title="Agents are flying blind"
            lede="An agent reaching a new system shouldn't need a PhD in API archaeology."
          />

          <RevealStagger
            direction="up"
            staggerMs={80}
            itemClassName="h-full"
            className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2"
          >
            {problems.map((problem, index) => (
              <div
                key={index}
                className="flex h-full gap-4 bg-card p-6 transition-colors duration-200 hover:bg-muted/40"
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
