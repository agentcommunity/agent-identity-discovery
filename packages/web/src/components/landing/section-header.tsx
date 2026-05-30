import type { ReactNode } from 'react';
import { Reveal } from './reveal';

/**
 * Canonical landing section header (infrastructure-editorial).
 * Mono eyebrow + tight bold title + optional lede. Left-aligned.
 */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  className = '',
  titleClassName = 'text-3xl md:text-4xl',
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <Reveal direction="up" className={`mb-12 md:mb-16 ${className}`}>
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className={`font-bold tracking-tight text-foreground ${titleClassName}`}>{title}</h2>
      {lede ? (
        <p className="mt-4 max-w-2xl text-base md:text-lg leading-relaxed text-muted-foreground">
          {lede}
        </p>
      ) : null}
    </Reveal>
  );
}
