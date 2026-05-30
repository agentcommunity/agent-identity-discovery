'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Puzzle, Clock, Settings } from 'lucide-react';
import { Reveal, RevealStagger } from './reveal';

const problems = [
  {
    icon: AlertTriangle,
    title: 'Manual Integration Hell',
    description: 'Every new system means bespoke code, doc digging, and manual config.',
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50 dark:bg-red-950/30',
  },
  {
    icon: Puzzle,
    title: 'Protocol Fragmentation',
    description: 'Agents speak MCP, A2A, OpenAPI and more — auth flows vary wildly.',
    iconColor: 'text-orange-500',
    iconBg: 'bg-orange-50 dark:bg-orange-950/30',
  },
  {
    icon: Clock,
    title: 'Wasted Development Time',
    description: 'Teams lose weeks wiring basic discovery and connection logic.',
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    icon: Settings,
    title: 'No Discovery & Identity Standard',
    description: 'No universal way to find an endpoint and verify who runs it.',
    iconColor: 'text-rose-500',
    iconBg: 'bg-rose-50 dark:bg-rose-950/30',
  },
];

export function Problem() {
  return (
    <section className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-6xl">
          <Reveal direction="up" className="mb-12 text-center">
            <h2 className="mb-4 text-4xl md:text-5xl font-bold tracking-tight">
              The Integration Problem
            </h2>
            <p className="text-xl md:text-2xl leading-relaxed text-muted-foreground">
              An agent reaching a new system shouldn&apos;t need a PhD in API archaeology
            </p>
          </Reveal>

          <RevealStagger direction="up" staggerMs={100} className="grid gap-6 md:grid-cols-2">
            {problems.map((problem, index) => (
              <Card
                key={index}
                className="card-feature bg-card/50 border-border/50 hover:bg-card transition-all duration-300 shadow-soft-lg hover:shadow-soft-xl hover:-translate-y-1 group"
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-lg ${problem.iconBg} border border-border/30 shadow-soft-xs transition-all duration-300 group-hover:scale-110 group-hover:shadow-soft-md`}
                    >
                      <problem.icon
                        className={`h-6 w-6 ${problem.iconColor} transition-transform duration-300 group-hover:scale-110`}
                      />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg transition-colors duration-300 group-hover:text-foreground">
                        {problem.title}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed transition-colors duration-300 group-hover:text-muted-foreground/80">
                    {problem.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </RevealStagger>
        </div>
      </div>
    </section>
  );
}
