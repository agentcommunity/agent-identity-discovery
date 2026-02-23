'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, PlayCircle } from 'lucide-react';
import { CopyButton } from '@/components/ui/copybutton';
import { getAidVersion, fetchAidVersion } from '@/lib/utils';

/* ---------- cycling domain text ---------- */
const DOMAINS = [
  'example.com',
  'acme.com',
  'northwind.com',
  'globex.com',
  'contoso.com',
  'fabrikam.com',
];

function useCyclingText(items: string[], intervalMs = 2400) {
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (!node) return;

      timerRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setIndex((prev) => (prev + 1) % items.length);
          setIsTransitioning(false);
        }, 300);
      }, intervalMs);
    },
    [items.length, intervalMs],
  );

  return { ref, value: items[index], isTransitioning };
}

/* ---------- animated stat counter ---------- */
function AnimatedStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="font-medium text-foreground group-stat">
      <span className="tabular-nums">{value}</span> {label}
    </span>
  );
}

/* ---------- main Hero component ---------- */
export function Hero() {
  const [aidVersion, setAidVersion] = useState(getAidVersion());
  const domain = useCyclingText(DOMAINS);

  // Fire-and-forget fetch on mount via ref callback
  const fetchedRef = useRef(false);
  const mountRef = useCallback((node: HTMLElement | null) => {
    if (!node || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAidVersion()
      .then(setAidVersion)
      .catch(() => {});
  }, []);

  return (
    <section ref={mountRef} className="relative w-full section-padding overflow-hidden">
      {/* ---- subtle grid background ---- */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.04)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.04)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      <div className="container mx-auto container-padding text-center">
        <div className="mx-auto max-w-5xl">
          <Badge
            variant="secondary"
            className="mb-6 animate-fade-in shadow-soft-xs hover:shadow-soft-md transition-all duration-200"
          >
            v{aidVersion} &bull; DNS-based Agent Identity &amp; Discovery
          </Badge>

          <h1 className="mb-8 text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-balance animate-fade-in-up">
            _agent Identity
            <span className="text-muted-foreground"> &amp; Discovery</span>
          </h1>

          <p className="mx-auto mb-4 max-w-4xl text-xl md:text-2xl leading-relaxed text-muted-foreground animate-fade-in-up">
            DNS for agents. Discover endpoints and verify identity.
          </p>

          {/* cycling domain */}
          <div
            ref={domain.ref}
            className="mx-auto mb-10 inline-flex items-center gap-2 font-mono text-sm md:text-base text-muted-foreground/70 animate-fade-in-up"
          >
            <span className="select-none">_agent.</span>
            <span
              className={`inline-block min-w-[13ch] transition-all duration-300 ${domain.isTransitioning ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'} text-foreground font-semibold`}
            >
              {domain.value}
            </span>
            <span className="select-none text-muted-foreground/40">TXT &rarr;</span>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center mb-12 animate-fade-in-up">
            <Button
              size="lg"
              asChild
              className="group shadow-soft-md hover:shadow-soft-lg transition-all duration-300 hover:scale-105"
            >
              <Link href="/workbench">
                <PlayCircle className="mr-2 h-5 w-5 transition-transform group-hover:scale-110" />
                Try the Resolver
              </Link>
            </Button>

            <Button
              variant="outline"
              size="lg"
              asChild
              className="group shadow-soft hover:shadow-soft-md transition-all duration-300 hover:scale-105"
            >
              <Link href="/docs/specification">
                Read the Specification
                <ExternalLink className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>

          {/* Key Facts */}
          <div className="mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-3 rounded-full bg-muted/50 px-6 py-3 text-sm border border-border/30 shadow-soft-md">
              <AnimatedStat value="9" label="protocols" />
              <span className="text-muted-foreground/40">&bull;</span>
              <AnimatedStat value="6" label="SDKs" />
              <span className="text-muted-foreground/40">&bull;</span>
              <span className="font-medium text-foreground">MIT licensed</span>
            </div>
          </div>

          {/* Install Command */}
          <div className="flex justify-center pt-4">
            <div className="bg-card border border-border/50 rounded-xl px-6 py-4 shadow-soft-lg hover:shadow-soft-xl transition-all duration-300 max-w-md group">
              <div className="flex items-center gap-4 font-mono text-sm">
                <span className="text-muted-foreground transition-colors duration-300 group-hover:text-primary">
                  $
                </span>
                <span className="text-foreground transition-colors duration-300 group-hover:text-foreground">
                  npm install @agentcommunity/aid
                </span>
                <CopyButton textToCopy="npm install @agentcommunity/aid" />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Core SDK. The CLI wraps the engine.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
