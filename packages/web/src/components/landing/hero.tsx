'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { CopyButton } from '@/components/ui/copybutton';
import { getAidVersion, fetchAidVersion } from '@/lib/utils';

/* ---------- cycling record examples ---------- */
type Example = { domain: string; proto: string; path: string };

const EXAMPLES: Example[] = [
  { domain: 'example.com', proto: 'mcp', path: 'mcp' },
  { domain: 'acme.com', proto: 'a2a', path: 'a2a' },
  { domain: 'northwind.com', proto: 'openapi', path: 'openapi.json' },
  { domain: 'globex.com', proto: 'grpc', path: 'grpc' },
  { domain: 'contoso.com', proto: 'mcp', path: 'mcp' },
];

function useCyclingItem<T>(items: T[], intervalMs = 3200) {
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
        }, 280);
      }, intervalMs);
    },
    [items.length, intervalMs],
  );

  return { ref, value: items[index], isTransitioning };
}

/* ---------- annotated record row ---------- */
function RecordRow({
  k,
  v,
  note,
  accent = false,
}: {
  k: string;
  v: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="truncate font-mono text-sm">
        <span className="text-muted-foreground">{k}=</span>
        <span className={accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}>
          {v}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground/60">{note}</span>
    </div>
  );
}

/* ---------- main Hero component ---------- */
export function Hero() {
  const [aidVersion, setAidVersion] = useState(getAidVersion());
  const ex = useCyclingItem(EXAMPLES);

  // Fire-and-forget version fetch on mount via ref callback
  const fetchedRef = useRef(false);
  const mountRef = useCallback((node: HTMLElement | null) => {
    if (!node || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAidVersion()
      .then(setAidVersion)
      .catch(() => {});
  }, []);

  const current = ex.value;

  return (
    <section ref={mountRef} className="relative w-full section-padding overflow-hidden">
      {/* precise grid background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.05)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.05)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-3xl text-center">
          {/* eyebrow */}
          <div className="mb-8 inline-flex items-center gap-2.5 font-mono text-sm uppercase tracking-[0.2em] text-foreground animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Agent Identity &amp; Discovery
            <span className="text-muted-foreground/60">v{aidVersion}</span>
          </div>

          {/* headline */}
          <h1 className="mb-6 text-5xl md:text-7xl font-bold tracking-tighter text-foreground animate-fade-in-up">
            DKIM for Agents<span className="text-emerald-500">.</span>
          </h1>

          {/* lede — the payoff */}
          <p className="mx-auto mb-12 max-w-2xl text-lg md:text-xl leading-relaxed text-muted-foreground animate-fade-in-up">
            Discovery and origin verification for agents and their tooling.
          </p>
        </div>

        {/* record specimen — the hero object */}
        <div ref={ex.ref} className="mx-auto max-w-xl animate-fade-in-up">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
            {/* query row */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground">
              <span>
                _agent.
                <span className="text-foreground transition-opacity duration-200">
                  {current.domain}
                </span>
              </span>
              <span className="uppercase tracking-wider text-muted-foreground/60">TXT</span>
            </div>
            {/* annotated record */}
            <div
              className={`divide-y divide-border/60 transition-opacity duration-200 ${
                ex.isTransitioning ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <RecordRow k="u" v={`https://${current.domain}/${current.path}`} note="where" />
              <RecordRow k="p" v={current.proto} note="what protocol" />
              <RecordRow k="k" v="ebVWLo_mVPlAeLES6K…" note="proof · Ed25519" accent />
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center animate-fade-in-up">
          <Button size="lg" asChild className="group">
            <Link href="/workbench">
              <PlayCircle className="mr-2 h-5 w-5" />
              Try the resolver
            </Link>
          </Button>
          <Button variant="ghost" size="lg" asChild className="group">
            <Link href="/docs/specification">
              Read the specification
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>

        {/* facts rule */}
        <div className="mt-12 flex items-center justify-center gap-3 font-mono text-xs uppercase tracking-wider text-muted-foreground animate-fade-in">
          <span>9 protocols</span>
          <span className="text-border">/</span>
          <span>6 SDKs</span>
          <span className="text-border">/</span>
          <span>MIT</span>
        </div>

        {/* install */}
        <div className="mt-6 flex justify-center animate-fade-in">
          <div className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 font-mono text-sm">
            <span className="text-muted-foreground/60">$</span>
            <span className="text-foreground">npm install @agentcommunity/aid</span>
            <CopyButton textToCopy="npm install @agentcommunity/aid" />
          </div>
        </div>
      </div>
    </section>
  );
}
