import React from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { AID_GENERATOR_URL } from '@/lib/constants';
import { ToolCallBlock } from '../tool-call-block';
import type { DiscoveryResult } from '@/hooks/use-discovery';
import { SecurityBadge } from '@/components/ui/security-badge';
import { TlsInspector } from '@/components/ui/tls-inspector';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { StepTimeline, type ToolStatus, type ErrorWithMetadata } from './shared';

interface DiscoveryToolBlockProps {
  status: ToolStatus;
  result?: DiscoveryResult | null;
  domain: string;
}

function DiscoveryDetailsView({ result }: { result: DiscoveryResult }) {
  if (!result) return null;
  const queryName = result.ok ? result.value?.metadata?.dnsQuery : '';
  const steps = [
    {
      text: queryName ? `Querying DNS for ${queryName}...` : 'Querying DNS...',
      completed: true,
    },
    {
      text: result.ok ? 'Found TXT Record' : 'No TXT Record found',
      completed: true,
      hasError: !result.ok,
    },
    {
      text: result.ok ? 'Parsing agent record...' : 'Discovery failed',
      completed: !!result.ok,
      hasError: !result.ok,
    },
  ];

  return <StepTimeline steps={steps} />;
}

export function DiscoveryToolBlock({ status, result, domain }: DiscoveryToolBlockProps) {
  const getCodeSnippets = () => {
    const snippets = [
      {
        title: 'DNS Lookup Command',
        code: `dig TXT _agent.${domain}`,
      },
    ];

    if (status === 'success' || status === 'error') {
      if (result?.ok && result.value?.metadata?.txtRecord) {
        const formattedTxtRecord = result.value.metadata.txtRecord.replaceAll(';', ';\n');
        snippets.push({
          title: 'Found TXT Record',
          code: formattedTxtRecord,
        });
      }

      if (result?.ok && result.value?.record) {
        const data = result.value.record;
        const proto = String(data.proto ?? data.protocol ?? 'unknown');
        const parsedRecord = [
          `Version: ${data.v}`,
          `URI: ${data.uri}`,
          `Protocol: ${proto}`,
          `Host: ${data.host}:${data.port}`,
          data.desc ? `Description: ${data.desc}` : null,
          data.auth ? `Auth: ${data.auth}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        snippets.push({
          title: 'Parsed Agent Record',
          code: parsedRecord,
        });
      } else if (result && !result.ok && result.error) {
        const lookupTime = (result.error as ErrorWithMetadata)?.metadata?.lookupTime ?? 'N/A';
        const errorMessage = (result.error as ErrorWithMetadata)?.message || 'Unknown error';

        snippets.push({
          title: 'Error Details',
          code: `Error: ${errorMessage}\nLookup time: ${lookupTime}ms`,
        });
      }
    }

    return snippets;
  };

  const getStatusText = () => {
    if (!result) return status;
    if (status === 'running') return 'Querying DNS...';
    if (result.ok) {
      return result.value?.record?.desc ? `Found: ${result.value.record.desc}` : 'Agent discovered';
    } else {
      const errorMessage = (result.error as ErrorWithMetadata)?.message || 'No _agent record found';
      return errorMessage;
    }
  };

  return (
    <ToolCallBlock
      title="Agent Discovery"
      Icon={Search}
      status={status}
      statusText={getStatusText()}
      codeSnippets={getCodeSnippets()}
      defaultExpanded={status === 'error'}
    >
      {result?.ok && (
        <div className="flex flex-wrap gap-2 text-xs mb-2">
          {result.value.metadata.dnssecPresent !== undefined && (
            <SecurityBadge variant={result.value.metadata.dnssecPresent ? 'success' : 'info'}>
              {result.value.metadata.dnssecPresent ? 'DNSSEC signed' : 'DNSSEC not present'}
            </SecurityBadge>
          )}
          {result.value.metadata.pka && (
            <SecurityBadge
              variant={
                result.value.metadata.pka.verified === true
                  ? 'success'
                  : (result.value.metadata.pka.present
                    ? 'warning'
                    : 'info')
              }
            >
              {result.value.metadata.pka.verified === true
                ? (result.value.metadata.pka.domainBound === true
                  ? 'PKA domain-bound'
                  : 'PKA verified')
                : (result.value.metadata.pka.present
                  ? 'PKA present'
                  : 'PKA not present')}
            </SecurityBadge>
          )}
          {result.value.metadata.tls && (
            <TlsInspector
              valid={result.value.metadata.tls.valid}
              daysRemaining={result.value.metadata.tls.daysRemaining}
            />
          )}
        </div>
      )}
      {result?.ok && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center text-xs text-muted-foreground gap-1 hover:text-foreground mt-2">
            <ChevronDown className="w-3 h-3" /> Security details
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 text-xs space-y-2">
            {result.value.metadata.txtRecord && (
              <div>
                <div className="font-medium">TXT bytes</div>
                <div className="font-mono break-all">{result.value.metadata.txtRecord.length}</div>
              </div>
            )}
            <div>
              <div className="font-medium">DNS query</div>
              <div className="font-mono break-all">{result.value.metadata.dnsQuery}</div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {result && !result.ok && (
        <>
          <DiscoveryDetailsView result={result} />
          <p className="mt-3 text-xs text-muted-foreground">
            If you manage this domain, you can{' '}
            <a
              href={AID_GENERATOR_URL}
              target="_self"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              create an AID record
            </a>{' '}
            using our generator.
          </p>
        </>
      )}
    </ToolCallBlock>
  );
}
