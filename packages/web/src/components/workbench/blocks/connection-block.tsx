import React from 'react';
import { Plug, ExternalLink, Terminal, BookOpen, ChevronDown } from 'lucide-react';
import { ToolCallBlock } from '../tool-call-block';
import type { DiscoveryResult } from '@/hooks/use-discovery';
import type { HandshakeResult, ProtocolGuidance } from '@/hooks/use-connection';
import { AuthRequiredError } from '@/hooks/use-connection';
import { SecurityBadge } from '@/components/ui/security-badge';
import { TlsInspector } from '@/components/ui/tls-inspector';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { A2ACardView } from '../a2a-card';
import { AuthPrompts } from '../auth-prompts';
import { StepTimeline, type ToolStatus, type AuthError } from './shared';

interface ConnectionToolBlockProps {
  status: ToolStatus;
  result?: HandshakeResult | null;
  discoveryResult?: DiscoveryResult | null;
  onProvideAuth?: (token: string) => void;
}

function ProtocolGuidanceView({ guidance }: { guidance: ProtocolGuidance }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-blue-800 font-medium">{guidance.title}</p>
            <p className="text-xs text-blue-700 mt-1">{guidance.description}</p>
          </div>
        </div>
      </div>

      {guidance.command && (
        <div className="p-3 bg-gray-900 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-400 font-medium">Run this command</span>
          </div>
          <code className="text-sm text-green-400 font-mono break-all">{guidance.command}</code>
        </div>
      )}

      {guidance.nextSteps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">Next steps:</p>
          <ul className="space-y-1.5">
            {guidance.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="bg-gray-200 text-gray-600 rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-medium">
                  {i + 1}
                </span>
                <span className="break-words">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {guidance.docsUrl && (
        <a
          href={guidance.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          View protocol documentation
        </a>
      )}
    </div>
  );
}

function ConnectionDetailsView({ result }: { result: HandshakeResult }) {
  if (!result) return null;
  const steps = [
    {
      text: 'Initializing handshake...',
      completed: true,
    },
    {
      text: result.ok ? 'Handshake complete' : 'Handshake failed',
      completed: true,
      hasError: !result.ok,
    },
    {
      text: result.ok
        ? `Agent offers ${result.value?.capabilities.length || 0} capabilities`
        : 'No capabilities available',
      completed: !!result.ok,
      hasError: !result.ok,
    },
  ];

  return <StepTimeline steps={steps} />;
}

export function ConnectionToolBlock({
  status,
  result,
  discoveryResult,
  onProvideAuth,
}: ConnectionToolBlockProps) {
  const hasGuidance = result?.ok && result.value?.guidance;
  const proto = String(
    discoveryResult?.ok ? (discoveryResult.value?.record?.proto ?? 'mcp') : 'mcp',
  );
  const protoUpper = proto.toUpperCase() || 'MCP';

  const getCodeSnippets = () => {
    const uri = String(
      (discoveryResult?.ok && discoveryResult.value?.record?.uri) || 'unknown-uri',
    );

    if (hasGuidance) {
      const guidance = result.value.guidance!;
      if (guidance.command) {
        return [{ title: protoUpper + ' Command', code: guidance.command }];
      }
      return [{ title: protoUpper + ' Endpoint', code: uri }];
    }

    const snippets = [
      {
        title: 'Handshake Request',
        code: `// ${protoUpper} Handshake Request\nfetch('/api/handshake', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({\n    uri: "${uri}",\n    proto: "${proto}"\n  })\n})`,
      },
    ];

    if (status === 'success' || status === 'error' || status === 'needs_auth') {
      if (result?.ok && result.value && !result.value.guidance) {
        const data = result.value;
        const response = {
          protocolVersion: data.protocolVersion,
          serverInfo: data.serverInfo,
          capabilities: data.capabilities.map((cap) => ({
            id: cap.id,
            type: cap.type,
          })),
        };
        snippets.push({
          title: 'Handshake Response',
          code: JSON.stringify(response, null, 2),
        });
      } else if (result && !result.ok && result.error) {
        const errorMessage = (result.error as AuthError)?.message || 'Unknown error';
        snippets.push({
          title: status === 'needs_auth' ? 'Authentication Required' : 'Connection Error',
          code: `Error: ${errorMessage}`,
        });
      }
    }

    return snippets;
  };

  const getStatusText = () => {
    if (!result) return status;
    if (status === 'running') return 'Establishing connection...';

    if (result.ok && result.value?.agentCard) {
      return `A2A Agent Card loaded: ${result.value.agentCard.name}`;
    }

    if (hasGuidance) {
      return protoUpper + ' agent discovered (see guidance below)';
    }

    if (result.ok) {
      const capCount = result.value?.capabilities?.length || 0;
      return `Connected (${capCount} capabilities)`;
    } else if (status === 'needs_auth') {
      return 'Ⓧ Connection not established (authentication required). AID worked.';
    } else {
      const errorMessage = (result.error as AuthError)?.message;
      return `Ⓧ Agent connection ${protoUpper}${errorMessage ? ` – ${errorMessage}` : ''}`;
    }
  };

  return (
    <ToolCallBlock
      title={hasGuidance ? protoUpper + ' Agent' : 'Agent Connection'}
      Icon={Plug}
      status={hasGuidance ? 'success' : (status === 'needs_auth' ? 'needs_auth' : status)}
      statusText={getStatusText()}
      codeSnippets={getCodeSnippets()}
      defaultExpanded={true}
    >
      {result?.ok && result.value?.agentCard && <A2ACardView card={result.value.agentCard} />}

      {hasGuidance && result.value.guidance && !result.value.agentCard && (
        <ProtocolGuidanceView guidance={result.value.guidance} />
      )}

      {result?.ok && result.value.security && !hasGuidance && (
        <div className="flex flex-wrap gap-2 text-xs mb-2">
          {typeof result.value.security.dnssec === 'boolean' && (
            <SecurityBadge variant={result.value.security.dnssec ? 'success' : 'info'}>
              {result.value.security.dnssec ? 'DNSSEC signed' : 'DNSSEC not present'}
            </SecurityBadge>
          )}
          {result.value.security.pka && (
            <SecurityBadge
              variant={
                result.value.security.pka.verified === true
                  ? 'success'
                  : (result.value.security.pka.present
                    ? 'warning'
                    : 'info')
              }
            >
              {result.value.security.pka.verified === true
                ? (result.value.security.pka.domainBound === true
                  ? 'PKA domain-bound'
                  : 'PKA verified')
                : (result.value.security.pka.present
                  ? 'PKA present'
                  : 'PKA not present')}
            </SecurityBadge>
          )}
          {result.value.security.tls && (
            <TlsInspector
              valid={result.value.security.tls.valid}
              daysRemaining={result.value.security.tls.daysRemaining}
            />
          )}
        </div>
      )}

      {result?.ok && result.value.security && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center text-xs text-muted-foreground gap-1 hover:text-foreground mt-2">
            <ChevronDown className="w-3 h-3" /> Security details
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 text-xs space-y-2">
            {result.value.security.warnings && result.value.security.warnings.length > 0 && (
              <div>
                <div className="font-medium">Warnings</div>
                <ul className="list-disc pl-4">
                  {result.value.security.warnings.map((w, i) => (
                    <li key={i} className="font-mono break-words">
                      {w.code}: {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.value.security.errors && result.value.security.errors.length > 0 && (
              <div>
                <div className="font-medium">Errors</div>
                <ul className="list-disc pl-4">
                  {result.value.security.errors.map((e, i) => (
                    <li key={i} className="font-mono break-words text-red-700">
                      {e.code}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {result && !hasGuidance && <ConnectionDetailsView result={result} />}

      {status === 'needs_auth' &&
        result &&
        !result.ok &&
        result.error instanceof AuthRequiredError && (
          <AuthPrompts
            error={result.error}
            uri={discoveryResult?.ok ? String(discoveryResult.value?.record?.uri ?? '') : undefined}
            authHint={
              discoveryResult?.ok
                ? (discoveryResult.value?.record?.auth as string | undefined)
                : undefined
            }
            onProvideAuth={onProvideAuth}
          />
        )}
    </ToolCallBlock>
  );
}
