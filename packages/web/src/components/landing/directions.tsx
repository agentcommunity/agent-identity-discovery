'use client';

import { ArrowRight, ArrowUp } from 'lucide-react';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';

type Direction = {
  from: string;
  to: string;
  blurb: string;
  mechanism: string;
  tag: string;
  /** True when AID answers this directly (one DNS lookup). */
  native: boolean;
};

const DIRECTIONS: Direction[] = [
  {
    from: 'agent',
    to: 'agent',
    blurb: "Reach another organization's agent.",
    mechanism: '_agent.acme.com → p=a2a',
    tag: 'one DNS lookup',
    native: true,
  },
  {
    from: 'agent',
    to: 'tool',
    blurb: "Reach a system's API or MCP server.",
    mechanism: '_agent.example.com → p=mcp',
    tag: 'one DNS lookup',
    native: true,
  },
  {
    from: 'agent',
    to: 'capability',
    blurb: 'Find any agent that can do a thing.',
    mechanism: 'list + sort across many agents',
    tag: 'builds on AID',
    native: false,
  },
];

export function Directions() {
  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="How agents use it"
            title="Three ways an agent reaches out"
            titleClassName="text-4xl md:text-5xl lg:text-6xl"
          />

          <div className="grid border-t border-border md:grid-cols-3">
            {DIRECTIONS.map((d) => (
              <Reveal
                key={d.to}
                direction="up"
                delay={d.native ? 0 : 120}
                className={`flex flex-col gap-5 border-b border-border py-8 md:border-b-0 md:px-7 md:py-10 md:[&:not(:last-child)]:border-r ${
                  d.native ? '' : 'md:border-l md:border-dashed bg-muted/20'
                }`}
              >
                {/* direction label */}
                <div className="flex items-center gap-2.5 font-mono text-lg font-semibold md:text-xl">
                  <span className="text-foreground">{d.from}</span>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  <span className={d.native ? 'text-foreground' : 'text-muted-foreground'}>
                    {d.to}
                  </span>
                </div>

                {/* blurb */}
                <p className="flex-1 text-base leading-relaxed text-muted-foreground">{d.blurb}</p>

                {/* mechanism */}
                <code className="block font-mono text-xs leading-relaxed text-muted-foreground/80">
                  {d.mechanism}
                </code>

                {/* tag */}
                {d.native ? (
                  <span className="inline-flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {d.tag}
                  </span>
                ) : (
                  <span className="inline-flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground/70">
                    <ArrowUp className="h-3.5 w-3.5" />
                    {d.tag}
                  </span>
                )}
              </Reveal>
            ))}
          </div>

          {/* thesis caption */}
          <Reveal direction="up" delay={150}>
            <p className="mt-10 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
              AID answers the first two directly. One DNS lookup gives the endpoint, the protocol,
              and the proof. Capability search is a directory that builds{' '}
              <span className="text-foreground">on top of</span> AID, not inside it.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
