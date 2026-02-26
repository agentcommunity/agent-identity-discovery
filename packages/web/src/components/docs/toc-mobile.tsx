'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronDown, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Heading } from '@/lib/docs';

interface TocMobileProps {
  headings: Heading[];
}

export function TocMobile({ headings }: TocMobileProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>('');
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Derive active heading from visible set
  useEffect(() => {
    if (visibleIds.size === 0) return;
    const firstVisible = headings.find((h) => visibleIds.has(h.id));
    if (firstVisible) setActiveId(firstVisible.id);
  }, [visibleIds, headings]);

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '-64px 0px -40% 0px',
      threshold: 0,
    });

    for (const heading of headings) {
      const el = document.querySelector(`#${CSS.escape(heading.id)}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings, handleIntersect]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const scrollToHeading = (id: string) => {
    setOpen(false);
    // Small delay to let dropdown close animation start before scroll
    requestAnimationFrame(() => {
      const el = document.querySelector(`#${CSS.escape(id)}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        globalThis.history.replaceState(null, '', `#${id}`);
        setActiveId(id);
      }
    });
  };

  if (headings.length === 0) return null;

  const activeHeading = headings.find((h) => h.id === activeId);

  return (
    <div ref={containerRef} className="relative xl:hidden mb-6">
      {/* Toggle button — shows current section */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors',
          'bg-muted/30 hover:bg-muted/50',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <List className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {activeHeading?.text ?? 'On this page'}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown list */}
      <div
        className={cn(
          'absolute left-0 right-0 z-30 mt-1 rounded-lg border border-border bg-card shadow-soft-lg overflow-hidden',
          'transition-all duration-200 origin-top',
          open ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0 pointer-events-none',
        )}
      >
        <nav aria-label="Table of contents" className="max-h-64 overflow-y-auto py-1">
          {headings.map((heading) => {
            const isActive = activeId === heading.id;
            const isVisible = visibleIds.has(heading.id);

            return (
              <button
                key={heading.id}
                type="button"
                onClick={() => scrollToHeading(heading.id)}
                style={{ paddingLeft: `${(heading.depth - 2) * 12 + 12}px` }}
                className={cn(
                  'flex w-full items-center gap-2 py-2 pr-3 text-sm transition-colors',
                  isActive
                    ? 'bg-muted/60 text-foreground font-medium'
                    : (isVisible
                      ? 'text-foreground/70 hover:bg-muted/30'
                      : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'),
                )}
              >
                {/* Indicator dot */}
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full flex-shrink-0 transition-all duration-300',
                    isActive
                      ? 'bg-foreground scale-100'
                      : (isVisible
                        ? 'bg-foreground/30 scale-100'
                        : 'bg-transparent scale-0'),
                  )}
                />
                <span className="truncate">{heading.text}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
