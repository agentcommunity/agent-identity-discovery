'use client';

import { useState, useRef, useCallback } from 'react';

const EXAMPLES = [
  { domain: 'example.com', proto: 'mcp', uri: 'https://example.com/mcp' },
  { domain: 'acme.com', proto: 'a2a', uri: 'https://acme.com/a2a' },
  { domain: 'northwind.com', proto: 'openapi', uri: 'https://northwind.com/openapi.json' },
  { domain: 'globex.com', proto: 'grpc', uri: 'https://globex.com/grpc' },
  { domain: 'contoso.com', proto: 'websocket', uri: 'wss://contoso.com/ws' },
];

function formatRecord(ex: (typeof EXAMPLES)[number]) {
  return `_agent.${ex.domain}. 300 IN TXT "v=aid1;u=${ex.uri};p=${ex.proto}"`;
}

const INTERVAL_MS = 3500;
const FADE_MS = 250;

export function RecordStrip() {
  const [idx, setIdx] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Transition to a new index with a fade */
  const goTo = useCallback((next: number) => {
    // Avoid double-firing if already transitioning
    if (fadeRef.current) return;

    setIsTransitioning(true);
    fadeRef.current = setTimeout(() => {
      setIdx(next);
      setIsTransitioning(false);
      fadeRef.current = null;
    }, FADE_MS);
  }, []);

  /** Start (or restart) the auto-advance timer */
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIdx((prev) => {
        const next = (prev + 1) % EXAMPLES.length;
        goTo(next);
        return prev; // goTo handles the actual state change
      });
    }, INTERVAL_MS);
  }, [goTo]);

  /** Ref-callback: start timer when element mounts, clear on unmount */
  const containerRef = useCallback(
    (node: HTMLElement | null) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (!node) return;
      startTimer();
    },
    [startTimer],
  );

  /** Handle manual dot click -- transition + reset timer */
  function handleDotClick(i: number) {
    if (i === idx) return;
    goTo(i);
    startTimer(); // reset auto-advance so it doesn't stomp immediately
  }

  const current = EXAMPLES[idx];

  return (
    <section ref={containerRef} className="py-6 md:py-8 bg-muted border-y border-border/50">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-base md:text-lg text-muted-foreground">
            One <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">_agent</code> TXT
            record for instant discovery and agent identity you can verify.
          </p>

          <div className="mt-4 flex flex-col items-center gap-2">
            {/* Dot indicators */}
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>example:</span>
              <div className="flex gap-1">
                {EXAMPLES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleDotClick(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === idx
                        ? 'w-5 bg-primary/60'
                        : 'w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40'
                    }`}
                    aria-label={`Show ${EXAMPLES[i].proto} example`}
                  />
                ))}
              </div>
            </div>

            {/* Record box */}
            <div
              className={`w-full max-w-3xl rounded-lg border border-border/50 bg-card px-4 py-3 text-left text-xs md:text-sm font-mono text-foreground overflow-x-auto transition-opacity duration-200 ${
                isTransitioning ? 'opacity-0' : 'opacity-100'
              }`}
            >
              {formatRecord(current)}
            </div>

            {/* Protocol indicator */}
            <div
              className={`flex items-center justify-center gap-1.5 h-5 text-xs transition-opacity duration-200 ${
                isTransitioning ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-muted-foreground/60">protocol:</span>
              <span className="font-mono font-medium text-muted-foreground">{current.proto}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
