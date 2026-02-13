'use client';

import { useEffect, useRef, useState, useId } from 'react';
import { cn } from '@/lib/utils';

interface MermaidDiagramProps {
  chart: string;
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
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          fontFamily: 'inherit',
          flowchart: { curve: 'basis', padding: 16 },
          sequence: { mirrorActors: false, messageMargin: 40 },
          themeVariables: {
            primaryColor: 'hsl(var(--muted))',
            primaryBorderColor: 'hsl(var(--border))',
            primaryTextColor: 'hsl(var(--foreground))',
            lineColor: 'hsl(var(--border))',
            secondaryColor: 'hsl(var(--muted))',
            tertiaryColor: 'hsl(var(--muted))',
            noteBkgColor: 'hsl(var(--muted))',
            noteTextColor: 'hsl(var(--muted-foreground))',
            noteBorderColor: 'hsl(var(--border))',
            edgeLabelBackground: 'hsl(var(--card))',
            clusterBkg: 'hsl(var(--muted) / 0.5)',
            clusterBorder: 'hsl(var(--border))',
            titleColor: 'hsl(var(--foreground))',
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
          className="mermaid-diagram [&_svg]:max-w-full [&_.node_rect]:!rx-[8px] [&_.node_rect]:!ry-[8px] [&_text]:!fill-[hsl(var(--foreground))] [&_.edgeLabel]:!bg-[hsl(var(--card))]"
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
