'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Heading } from '@/lib/docs';

interface TocProps {
  headings: Heading[];
}

export function Toc({ headings }: TocProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0.1 },
    );

    for (const heading of headings) {
      const el = document.querySelector(`#${CSS.escape(heading.id)}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-3 font-semibold text-foreground">On this page</p>
      <ul className="space-y-1.5">
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingLeft: `${(heading.depth - 2) * 12}px` }}>
            <a
              href={`#${heading.id}`}
              className={cn(
                'block truncate text-muted-foreground transition-colors hover:text-foreground',
                activeId === heading.id && 'font-medium text-foreground',
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
