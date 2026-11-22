'use client';

import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ModelMarketInteropReport } from '@/lib/interop/modelmarket';

const labels = new Map([
  ['unbound', 'Proof without a domain'],
  ['bound', 'Proof for modelmarket.dev'],
  ['wrong-domain', 'Refusal for a different domain'],
  ['card-digest', 'ARD server card'],
  ['stale-endpoint', 'Endpoint mismatch'],
  ['stale-digest', 'Card digest mismatch'],
]);

const fixtureDetails = new Map([
  ['stale-endpoint', 'The card digest matches and its endpoint differs from DNS.'],
  ['stale-digest', 'The fetched card bytes differ from the catalog digest.'],
]);

type Result =
  | ModelMarketInteropReport['live'][number]
  | ModelMarketInteropReport['fixtures'][number];

function ResultList({ results }: { results: Result[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {results.map((result) => (
        <li key={result.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{labels.get(result.id)}</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {result.passed ? (fixtureDetails.get(result.id) ?? result.expected) : result.observed}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
            {result.passed ? (
              <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <X aria-hidden className="size-4 text-destructive" />
            )}
            {result.passed ? 'Pass' : 'Fail'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ModelMarketChecks() {
  const [report, setReport] = useState<ModelMarketInteropReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const json = report ? JSON.stringify(report, null, 2) : '';

  async function runChecks() {
    setRunning(true);
    setReport(null);
    setError('');
    setCopyStatus('');
    try {
      const response = await fetch('/api/interop/modelmarket', { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setReport((await response.json()) as ModelMarketInteropReport);
    } catch {
      setError('The checks could not run. Try again.');
    } finally {
      setRunning(false);
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus('Report copied.');
    } catch {
      setCopyStatus('Open the JSON report to copy it manually.');
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void runChecks()} disabled={running}>
          {running ? 'Running checks…' : 'Run checks'}
        </Button>
        {report && (
          <Button type="button" variant="outline" onClick={() => void copyReport()}>
            <Copy aria-hidden className="mr-2 size-4" />
            Copy report
          </Button>
        )}
        <span role="status" className="text-sm text-muted-foreground">
          {running ? 'Checking modelmarket.dev…' : copyStatus || (report ? 'Checks complete.' : '')}
        </span>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {report && (
        <>
          <section aria-labelledby="live-checks" className="space-y-3">
            <h2
              id="live-checks"
              className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
            >
              Live checks
            </h2>
            <p className="break-all font-mono text-sm text-muted-foreground">{report.endpoint}</p>
            <ResultList results={report.live} />
          </section>
          <section aria-labelledby="stale-fixtures" className="space-y-3">
            <h2
              id="stale-fixtures"
              className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
            >
              Stale card fixtures
            </h2>
            <p className="text-sm text-muted-foreground">
              These local examples use the same Streamable HTTP field as ModelMarket’s live card.
            </p>
            <ResultList results={report.fixtures} />
          </section>
          <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer font-medium">View JSON report</summary>
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {json}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
