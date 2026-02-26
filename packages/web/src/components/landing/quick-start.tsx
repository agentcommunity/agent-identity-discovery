// New minimal 3-step Quick Start aligned with docs & README
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Compass, Rocket, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Codeblock } from '@/components/ui/codeblock';
import { Reveal } from './reveal';

// --- Code snippets identical to README / docs ------------------------------
const DISCOVER_SNIPPETS: Record<string, string> = {
  typescript: `import { discover } from '@agentcommunity/aid'

const { record } = await discover('example.com')
console.log(record.uri) // https://api.example.com/mcp`,
  python: `from aid_py import discover

record = discover('example.com')
print(record.uri) # https://api.example.com/mcp`,
  go: `import "github.com/agentcommunity/aid-go"

rec, err := aid.Discover("example.com")
if err != nil { /* handle */ }
fmt.Println(rec.Record.URI) // https://api.example.com/mcp`,
  rust: `use aid_rs::discover;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let rec = discover("example.com", Duration::from_secs(5)).await?;
    println!("{} {}", rec.proto, rec.uri);
    Ok(())
}`,
  java: `import org.agentcommunity.aid.Discovery;
import org.agentcommunity.aid.Discovery.DiscoveryOptions;

var result = Discovery.discover("example.com", new DiscoveryOptions());
System.out.println(result.record.proto + " at " + result.record.uri);`,
  dotnet: `using AidDiscovery;

var result = await Discovery.DiscoverAsync(
  domain: "example.com",
  new DiscoveryOptions {
    Timeout = TimeSpan.FromSeconds(5),
    WellKnownFallback = true,
    WellKnownTimeout = TimeSpan.FromSeconds(2)
  }
);

Console.WriteLine($"{result.Record.Proto} at {result.Record.Uri}");`,
};

const DNS_SNIPPET = `_agent.example.com. 300 IN TXT "v=aid1;u=https://api.example.com/mcp;p=mcp"`;
const DNS_PKA_SNIPPET = `_agent.example.com. 300 IN TXT "v=aid1;u=https://api.example.com/mcp;p=mcp;k=z7rW8rTq8o4mM6vVf7w1k3m4uQn9p2YxCAbcDeFgHiJ;i=g1"`;
const TERRAFORM_SNIPPET = `resource "cloudflare_record" "aid" {
  zone_id = var.zone_id
  name    = "_agent"
  type    = "TXT"
  value   = "v=aid1;u=https://api.example.com/openapi.json;p=openapi"
}`;

const VALIDATE_SNIPPET = `# Validate your record from the CLI
npx @agentcommunity/aid-doctor check example.com`;

// ---------------------------------------------------------------------------

export function QuickStart() {
  const [step, setStep] = useState<'discover' | 'publish' | 'validate'>('discover');
  const [lang, setLang] = useState<'typescript' | 'python' | 'go' | 'rust' | 'java' | 'dotnet'>(
    'typescript',
  );
  const [publishTab, setPublishTab] = useState<'dns' | 'terraform' | 'dns+identity'>('dns');

  const STEPS: Array<{ id: 'discover' | 'publish' | 'validate'; label: string; Icon: LucideIcon }> =
    [
      { id: 'discover', label: 'Discover', Icon: Compass },
      { id: 'publish', label: 'Publish', Icon: Rocket },
      { id: 'validate', label: 'Validate', Icon: ShieldCheck },
    ];

  return (
    <section className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-4xl">
          {/* Heading */}
          <Reveal direction="up" className="mb-12 text-center">
            <h2 className="mb-4 text-4xl md:text-5xl font-bold tracking-tight">Quick Start</h2>
            <p className="text-xl md:text-2xl leading-relaxed text-muted-foreground">
              Discover, publish and validate in minutes
            </p>
          </Reveal>

          {/* Hero Card */}
          <Card className="card-feature shadow-soft-lg hover:shadow-soft-xl transition-all duration-300">
            <CardHeader className="pb-6">
              {/* Step toggle group (iconic, theme-aligned) */}
              <div className="flex justify-center gap-3">
                {STEPS.map((item, idx) => {
                  const active = step === item.id;
                  const Icon: LucideIcon = item.Icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setStep(item.id)}
                      className={`card-interactive px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 text-sm font-medium border border-border/50 shadow-soft-xs hover:shadow-soft-md ${
                        active ? 'bg-primary/10 border-primary/30' : 'bg-card/50'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Step {idx + 1}
                        </div>
                        <div className={`leading-tight ${active ? 'text-foreground' : ''}`}>
                          {item.label}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent>
              {step === 'discover' && (
                <div className="space-y-4">
                  <Codeblock
                    title="discover"
                    content={DISCOVER_SNIPPETS[lang]}
                    rightSlot={
                      <div className="flex gap-1 flex-wrap">
                        {(['typescript', 'python', 'go', 'rust', 'java', 'dotnet'] as const).map(
                          (l) => (
                            <Button
                              key={l}
                              size="sm"
                              variant={lang === l ? 'default' : 'outline'}
                              className="capitalize text-xs"
                              onClick={() => setLang(l)}
                            >
                              {l === 'dotnet' ? '.NET' : l}
                            </Button>
                          ),
                        )}
                      </div>
                    }
                  />
                </div>
              )}

              {step === 'publish' && (
                <div className="space-y-4">
                  <Codeblock
                    title={publishTab}
                    content={
                      publishTab === 'dns'
                        ? DNS_SNIPPET
                        : (publishTab === 'terraform'
                          ? TERRAFORM_SNIPPET
                          : DNS_PKA_SNIPPET)
                    }
                    rightSlot={
                      <div className="flex gap-1">
                        {(['dns', 'terraform', 'dns+identity'] as const).map((t) => (
                          <Button
                            key={t}
                            size="sm"
                            variant={publishTab === t ? 'default' : 'outline'}
                            className="capitalize text-xs"
                            onClick={() => setPublishTab(t)}
                          >
                            {t}
                          </Button>
                        ))}
                      </div>
                    }
                  />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button variant="ghost" asChild className="text-sm">
                      <Link href="/docs/quickstart">Quick Start Guide</Link>
                    </Button>
                    <Button variant="ghost" asChild className="text-sm">
                      <Link href="/docs/specification">Specification</Link>
                    </Button>
                    <Button variant="ghost" asChild className="text-sm">
                      <Link href="/docs/Tooling/aid_doctor">aid-doctor CLI</Link>
                    </Button>
                  </div>
                </div>
              )}

              {step === 'validate' && (
                <div className="space-y-4">
                  <Codeblock title="terminal" content={VALIDATE_SNIPPET} />
                  <div className="text-sm text-muted-foreground">
                    Lint your record, verify DNS resolution, and test PKA identity — all from one
                    command.
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button variant="ghost" asChild className="text-sm">
                      <Link href="/docs/Tooling/aid_doctor">aid-doctor CLI</Link>
                    </Button>
                    <Button variant="ghost" asChild className="text-sm">
                      <Link href="/docs/Tooling/aid_engine">Engine Docs</Link>
                    </Button>
                    <Button variant="ghost" asChild className="text-sm">
                      <Link href="/docs/Tooling/conformance">Conformance Suite</Link>
                    </Button>
                    <Button variant="ghost" asChild className="text-sm">
                      <Link href="/docs/Reference/identity_pka">PKA Identity</Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Docs link */}
          <div className="mt-8 text-center">
            <Link href="/docs" className="text-sm font-medium text-primary hover:underline">
              Need more? Read the full Quick Start guide →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
