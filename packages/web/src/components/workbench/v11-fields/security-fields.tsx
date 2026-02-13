'use client';

import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { PkaKeyGenerator } from '@/components/ui/pka-key-generator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

export interface SecurityFieldsProps {
  pka?: string;
  kid?: string;
  onChange: (patch: Partial<{ pka?: string; kid?: string }>) => void;
}

export function SecurityFields({ pka, kid, onChange }: SecurityFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Public Key for Agents (PKA)</label>
          <Input
            value={pka || ''}
            onChange={(e) => onChange({ pka: e.target.value })}
            placeholder="z…"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Key ID (rotation)</label>
          <Input
            value={kid || ''}
            onChange={(e) => onChange({ kid: e.target.value })}
            placeholder="g1"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Learn more about PKA in{' '}
        <Link href="/docs/Reference/identity_pka" className="underline">
          the docs
        </Link>
        . Private key is generated locally and not saved by the app.
      </p>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="secondary" className="gap-2">
            <ChevronDown className="w-4 h-4" /> Public Key for Agents (PKA) Generator
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <PkaKeyGenerator
            onPublicKey={(k) => onChange({ pka: k, kid: kid && kid.length > 0 ? kid : 'g1' })}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
