'use client';

import type { ReactNode } from 'react';
import { Terminal } from 'lucide-react';
import { CopyButton } from '@/components/ui/copybutton';

/**
 * Unified landing code panel (infrastructure-editorial).
 * Hairline header strip (title + optional controls + copy) over a
 * slightly darker code body. Matches the SDK install box.
 *
 * Set `bordered={false}` when nesting inside an existing hairline container.
 */
export function CodePanel({
  title,
  content,
  rightSlot,
  bordered = true,
}: {
  title: string;
  content: string;
  rightSlot?: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? 'overflow-hidden rounded-lg border border-border' : ''}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          {title}
        </span>
        <div className="flex items-center gap-3">
          {rightSlot}
          <CopyButton textToCopy={content} />
        </div>
      </div>
      <pre className="overflow-x-auto bg-muted/50 px-4 py-4 font-mono text-sm leading-relaxed text-foreground">
        {content}
      </pre>
    </div>
  );
}
