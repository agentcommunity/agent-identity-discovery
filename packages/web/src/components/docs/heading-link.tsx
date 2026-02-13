'use client';

import { useState, useCallback } from 'react';
import { Link2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeadingLinkProps {
  id?: string;
  className?: string;
}

export function HeadingLink({ id, className }: HeadingLinkProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!id) return;
      const url = `${globalThis.location.origin}${globalThis.location.pathname}#${id}`;
      void navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [id],
  );

  if (!id) return null;

  return (
    <button
      type="button"
      onClick={copyLink}
      aria-label="Copy link to section"
      className={cn(
        'inline-flex items-center justify-center ml-2 align-middle',
        'h-5 w-5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100',
        'transition-opacity duration-150 text-muted-foreground hover:text-foreground',
        copied && 'opacity-100 !text-green-500',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
    </button>
  );
}
