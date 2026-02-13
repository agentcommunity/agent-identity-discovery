'use client';

import { useEffect, useRef, useState, useId } from 'react';
import { cn } from '@/lib/utils';

interface MermaidDiagramProps {
  chart: string;
}

/** Read a CSS custom property value from :root as a resolved color string. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Convert "210 40% 96.1%" → "hsl(210 40% 96.1%)" if it looks like bare HSL values. */
function toColor(raw: string): string {
  // Already a full color (hex, rgb, hsl with wrapper, named color, etc.)
  if (/^(#|rgb|hsl|oklch|oklab|color\(|[a-z]+$)/i.test(raw)) return raw;
  // Bare HSL channel values from Tailwind ("210 40% 96.1%")
  return `hsl(${raw})`;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const uniqueId = useId().replaceAll(':', '_');

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        // Resolve design-system colors at render time so mermaid can do color math
        const fg = toColor(cssVar('--foreground'));
        const mutedFg = toColor(cssVar('--muted-foreground'));
        const muted = toColor(cssVar('--muted'));
        const border = toColor(cssVar('--border'));
        const card = toColor(cssVar('--card'));

        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          fontFamily: 'inherit',
          flowchart: { curve: 'basis', padding: 16 },
          sequence: { mirrorActors: false, messageMargin: 40 },
          themeVariables: {
            primaryColor: muted,
            primaryBorderColor: border,
            primaryTextColor: fg,
            lineColor: border,
            secondaryColor: muted,
            tertiaryColor: muted,
            noteBkgColor: muted,
            noteTextColor: mutedFg,
            noteBorderColor: border,
            edgeLabelBackground: card,
            clusterBkg: muted,
            clusterBorder: border,
            titleColor: fg,
          },
        });

        const { svg: rendered } = await mermaid.render(`mermaid_${uniqueId}`, chart.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError('');
        }
      } catch (error_) {
        if (!cancelled) {
          setError(error_ instanceof Error ? error_.message : 'Failed to render diagram');
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, uniqueId]);

  if (error) {
    return (
      <div className="my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive mb-2">Diagram Error</p>
        <pre className="text-xs text-muted-foreground overflow-x-auto">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'my-6 flex justify-center rounded-xl border border-border bg-card/50 p-6',
        'overflow-x-auto',
        !svg && 'min-h-[120px] items-center',
      )}
    >
      {svg ? (
        <div
          ref={containerRef}
          className={cn(
            'mermaid-diagram [&_svg]:max-w-full',
            '[&_.node_rect]:rx-[8px] [&_.node_rect]:ry-[8px]',
            '[&_.label]:!text-[color:var(--foreground)]',
            '[&_.edgeLabel]:!bg-[color:var(--card)]',
          )}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          Rendering diagram...
        </div>
      )}
    </div>
  );
}
