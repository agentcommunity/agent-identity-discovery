'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, FileText, Github } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiToolbarProps {
  slug: string;
  rawContent: string;
}

function ToolbarButton({
  onClick,
  href,
  children,
  className,
}: {
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const baseClass = cn(
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
    'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
    className,
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={baseClass}>
        {children}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={baseClass}>
      {children}
    </button>
  );
}

export function AiToolbar({ slug, rawContent }: AiToolbarProps) {
  const [copied, setCopied] = useState(false);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  const githubPath = `https://github.com/agentcommunity/agent-identity-discovery/blob/main/packages/docs/${slug}.md`;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-1.5">
      <ToolbarButton onClick={() => void copyMarkdown()}>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? 'Copied' : 'Copy MD'}
      </ToolbarButton>

      <ToolbarButton href={`/api/docs/${slug}`}>
        <FileText className="h-3.5 w-3.5" />
        Raw
      </ToolbarButton>

      <ToolbarButton href={githubPath}>
        <Github className="h-3.5 w-3.5" />
        Source
      </ToolbarButton>
    </div>
  );
}
