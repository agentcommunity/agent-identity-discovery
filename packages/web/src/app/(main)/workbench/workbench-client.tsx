'use client';

import { useState, useEffect, useRef } from 'react';
import { DiscoveryChat } from '@/components/workbench/discovery-chat';
import { GeneratorPanel } from '@/components/workbench/generator-panel';

export function WorkbenchClient() {
  const [mode, setMode] = useState<'resolver' | 'generator'>('resolver');
  const resolverRef = useRef<HTMLDivElement>(null);
  const generatorRef = useRef<HTMLDivElement>(null);

  // Handle hash-based routing
  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const updateModeFromHash = () => {
      const hash = globalThis.location.hash.slice(1);
      const next = hash === 'generator' ? 'generator' : 'resolver';
      setMode((prev) => {
        if (prev !== next) {
          // Reset scroll on the panel we're switching to
          const target = next === 'resolver' ? resolverRef : generatorRef;
          const scrollable = target.current?.querySelector('[data-scroll-region]');
          if (scrollable) scrollable.scrollTop = 0;
        }
        return next;
      });
    };

    updateModeFromHash();
    globalThis.addEventListener('hashchange', updateModeFromHash);
    return () => globalThis.removeEventListener('hashchange', updateModeFromHash);
  }, []);

  return (
    <div className="h-full overflow-hidden">
      <div className="relative h-full">
        {/* Resolver Panel */}
        <div
          ref={resolverRef}
          className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            mode === 'resolver'
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 -translate-x-full pointer-events-none'
          }`}
        >
          <DiscoveryChat />
        </div>

        {/* Generator Panel */}
        <div
          ref={generatorRef}
          className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            mode === 'generator'
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-full pointer-events-none'
          }`}
        >
          <GeneratorPanel />
        </div>
      </div>
    </div>
  );
}
