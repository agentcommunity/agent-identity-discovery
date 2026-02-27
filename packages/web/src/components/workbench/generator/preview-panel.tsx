'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Codeblock } from '@/components/ui/codeblock';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, Globe, Lightbulb, ChevronDown, Key } from 'lucide-react';
import { ValidationSummary } from './validation-summary';
import type { ServerValidationResult } from '@/hooks/use-generator-form';

interface PreviewPanelProps {
  dnsHost: string;
  txtRecordString: string;
  txtBytes: number;
  previewValid: boolean;
  previewErrors: Array<{ code: string; message: string }>;
  specValidation: { isValid: boolean; errors: Array<{ code: string; message: string }> };
  serverResult: ServerValidationResult | null;
  wellKnownJson: Record<string, unknown>;
}

export function PreviewPanel({
  dnsHost,
  txtRecordString,
  txtBytes,
  previewValid,
  previewErrors,
  specValidation,
  serverResult,
  wellKnownJson,
}: PreviewPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-row justify-between items-center">
          <CardTitle className="text-base">Preview</CardTitle>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">Canonical short-key format</div>
            {previewValid && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                Valid
              </div>
            )}
            {previewValid === false && (
              <div className="flex items-center gap-1 text-destructive">
                <XCircle className="w-4 h-4" />
                Invalid
              </div>
            )}
          </div>
        </div>
        {previewErrors.length > 0 && <ValidationSummary errors={previewErrors} />}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm space-y-2">
          <p className="mb-1 font-medium">DNS Record:</p>
          <Codeblock
            title="Host"
            icon={<Globe className="w-4 h-4" />}
            content={dnsHost}
            variant="inline"
          />
          <div className="flex items-center gap-2 px-4 text-sm text-muted-foreground">
            <span className="font-mono">Type</span>
            <span>TXT</span>
          </div>
          <div className="flex items-center gap-3">
            <Codeblock
              title="Value"
              icon={<Key className="w-4 h-4" />}
              content={serverResult?.txt || txtRecordString}
              variant="inline"
            />
            <div
              className={`text-xs ${(serverResult?.bytes.txt ?? txtBytes) > 255 ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {serverResult?.bytes.txt ?? txtBytes} bytes
            </div>
          </div>
        </div>

        <div className="text-sm space-y-2">
          <p className="mb-1 font-medium">.well-known Fallback (JSON)</p>
          <Codeblock
            title="/\.well-known/agent"
            icon={<Globe className="w-4 h-4" />}
            content={JSON.stringify(serverResult?.json || wellKnownJson, null, 2)}
          />
        </div>

        {specValidation.isValid && (
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Ready to publish!</AlertTitle>
            <AlertDescription>
              Add the DNS record above to your DNS provider. AID v1.x publishes short keys as the
              canonical wire format.
            </AlertDescription>
          </Alert>
        )}

        {!specValidation.isValid && <ValidationSummary errors={specValidation.errors} />}

        {specValidation.isValid && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center text-sm text-muted-foreground gap-1 hover:text-foreground mt-2">
              <ChevronDown className="w-4 h-4" />
              Guide for common DNS providers
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 text-sm text-muted-foreground pl-1">
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>
                  <strong>Cloudflare:</strong> DNS → Records → Add TXT
                </li>
                <li>
                  <strong>Route53:</strong> Hosted zones → Create record
                </li>
                <li>
                  <strong>Google Cloud DNS:</strong> Zone → Add record
                </li>
                <li>
                  <strong>Namecheap:</strong> Advanced DNS → Add new record
                </li>
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
