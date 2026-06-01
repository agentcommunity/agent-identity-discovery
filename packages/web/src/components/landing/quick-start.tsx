// New minimal 3-step Quick Start aligned with docs & README
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Compass, Rocket, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CodePanel } from './code-panel';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';

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

const DNS_SNIPPET = `_agent.example.com. 300 IN TXT "v=aid2;u=https://api.example.com/mcp;p=mcp"`;
const DNS_PKA_SNIPPET = `_agent.example.com. 300 IN TXT "v=aid2;u=https://api.example.com/mcp;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ"`;
const TERRAFORM_SNIPPET = `resource "cloudflare_record" "aid" {
  zone_id = var.zone_id
  name    = "_agent"
  type    = "TXT"
  value   = "v=aid2;u=https://api.example.com/openapi.json;p=openapi"
}`;

const VALIDATE_SNIPPET = `# Validate your record from the CLI
npx @agentcommunity/aid-doctor check example.com`;

const PUBLISH_SNIPPETS: Record<'dns' | 'terraform' | 'dns+identity', string> = {
  dns: DNS_SNIPPET,
  terraform: TERRAFORM_SNIPPET,
  'dns+identity': DNS_PKA_SNIPPET,
};

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
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-4xl">
          <SectionHeader
            eyebrow="Quick start"
            title="Discover, publish, validate"
            lede="In minutes, from your language of choice or the CLI."
          />

          {/* Console */}
          <Reveal direction="up">
            <div className="overflow-hidden rounded-lg border border-border">
              {/* step tabs */}
              <div className="flex gap-px border-b border-border bg-border">
                {STEPS.map((item, idx) => {
                  const active = step === item.id;
                  const Icon: LucideIcon = item.Icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setStep(item.id)}
                      aria-pressed={active}
                      className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 font-mono text-sm transition-colors duration-150 ${
                        active
                          ? 'bg-card font-medium text-foreground'
                          : 'bg-muted/40 text-muted-foreground hover:bg-card/60'
                      }`}
                    >
                      <span className="text-muted-foreground/50">{`0${idx + 1}`}</span>
                      <Icon className="hidden h-4 w-4 sm:block" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {step === 'discover' && (
                <CodePanel
                  bordered={false}
                  title="discover"
                  content={DISCOVER_SNIPPETS[lang]}
                  rightSlot={
                    <div className="flex flex-wrap gap-2.5">
                      {(['typescript', 'python', 'go', 'rust', 'java', 'dotnet'] as const).map(
                        (l) => (
                          <button
                            key={l}
                            onClick={() => setLang(l)}
                            aria-pressed={lang === l}
                            className={`font-mono text-xs capitalize transition-colors ${
                              lang === l
                                ? 'font-medium text-foreground'
                                : 'text-muted-foreground/60 hover:text-foreground'
                            }`}
                          >
                            {l === 'dotnet' ? '.NET' : l}
                          </button>
                        ),
                      )}
                    </div>
                  }
                />
              )}

              {step === 'publish' && (
                <>
                  <CodePanel
                    bordered={false}
                    title={publishTab}
                    content={PUBLISH_SNIPPETS[publishTab]}
                    rightSlot={
                      <div className="flex gap-2.5">
                        {(['dns', 'terraform', 'dns+identity'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setPublishTab(t)}
                            aria-pressed={publishTab === t}
                            className={`font-mono text-xs transition-colors ${
                              publishTab === t
                                ? 'font-medium text-foreground'
                                : 'text-muted-foreground/60 hover:text-foreground'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    }
                  />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-card px-4 py-3">
                    {[
                      { href: '/docs/quickstart', label: 'Quick Start Guide' },
                      { href: '/docs/specification', label: 'Specification' },
                      { href: '/docs/tooling/aid_doctor', label: 'aid-doctor CLI' },
                    ].map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}

              {step === 'validate' && (
                <>
                  <CodePanel bordered={false} title="terminal" content={VALIDATE_SNIPPET} />
                  <div className="border-t border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    Lint your record, verify DNS resolution, and test PKA identity, all from one
                    command.
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-card px-4 py-3">
                    {[
                      { href: '/docs/tooling/aid_doctor', label: 'aid-doctor CLI' },
                      { href: '/docs/tooling/aid_engine', label: 'Engine Docs' },
                      { href: '/docs/tooling/conformance', label: 'Conformance Suite' },
                      { href: '/docs/reference/identity_pka', label: 'PKA Identity' },
                    ].map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Reveal>

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
