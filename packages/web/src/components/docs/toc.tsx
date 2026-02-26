'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Heading } from '@/lib/docs';

interface TocProps {
  headings: Heading[];
}

export function Toc({ headings }: TocProps) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Track which headings are currently visible in the viewport
  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      for (const entry of entries) {
        if (entry.isIntersecting) {
          next.add(entry.target.id);
        } else {
          next.delete(entry.target.id);
        }
      }
      return next;
    });
  }, []);

  // Derive the "active" heading — the first visible one in document order
  useEffect(() => {
    if (visibleIds.size === 0) return;
    const firstVisible = headings.find((h) => visibleIds.has(h.id));
    if (firstVisible) setActiveId(firstVisible.id);
  }, [visibleIds, headings]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin: '-64px 0px -40% 0px',
      threshold: 0,
    });

    for (const heading of headings) {
      const el = document.querySelector(`#${CSS.escape(heading.id)}`);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [headings, handleIntersect]);

  // Set initial active on mount from URL hash
  useEffect(() => {
    const hash = globalThis.location.hash.slice(1);
    if (hash) {
      setActiveId(hash);
    } else if (headings.length > 0) {
      setActiveId(headings[0].id);
    }
  }, [headings]);

  const scrollToHeading = (id: string) => {
    const el = document.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL hash without scroll jump
      globalThis.history.replaceState(null, '', `#${id}`);
      setActiveId(id);
    }
  };

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        On this page
      </p>
      <ul className="relative">
        {/* Animated indicator bar */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

        {headings.map((heading) => {
          const isActive = activeId === heading.id;
          const isVisible = visibleIds.has(heading.id);

          return (
            <li key={heading.id} className="relative">
              {/* Active indicator */}
              <div
                className={cn(
                  'absolute left-0 top-0 h-full w-0.5 rounded-full transition-all duration-300 ease-out',
                  isActive
                    ? 'bg-foreground opacity-100'
                    : (isVisible
                      ? 'bg-foreground/30 opacity-100'
                      : 'bg-transparent opacity-0'),
                )}
              />

              <button
                type="button"
                onClick={() => scrollToHeading(heading.id)}
                style={{ paddingLeft: `${(heading.depth - 2) * 12 + 12}px` }}
                className={cn(
                  'block w-full truncate py-1.5 text-left transition-all duration-200',
                  isActive
                    ? 'text-foreground font-medium'
                    : (isVisible
                      ? 'text-foreground/70'
                      : 'text-muted-foreground hover:text-foreground'),
                )}
              >
                {heading.text}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
