'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, FileText, Github } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiToolbarProps {
  slug: string;
  rawContent: string;
}

export function AiToolbar({ slug, rawContent }: AiToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const githubPath = `https://github.com/agentcommunity/agent-identity-discovery/blob/main/packages/docs/${slug}.md`;

  return (
    <div className="relative mb-6 inline-flex" ref={menuRef}>
      {/* Main copy button */}
      <button
        type="button"
        onClick={() => void copyMarkdown()}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-l-md border border-border/50 bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? 'Copied!' : 'Copy Markdown'}
      </button>

      {/* Dropdown toggle */}
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className={cn(
          'inline-flex items-center rounded-r-md border border-l-0 border-border/50 bg-muted/40 px-1.5 py-1.5 transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', menuOpen && 'rotate-180')} />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 z-20 mt-1 min-w-[160px] rounded-md border border-border bg-card shadow-soft-lg">
          <a
            href={`/api/docs/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-t-md"
            onClick={() => setMenuOpen(false)}
          >
            <FileText className="h-3.5 w-3.5" />
            View Raw
            <ExternalLink className="ml-auto h-3 w-3" />
          </a>
          <a
            href={githubPath}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-b-md"
            onClick={() => setMenuOpen(false)}
          >
            <Github className="h-3.5 w-3.5" />
            View on GitHub
            <ExternalLink className="ml-auto h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
