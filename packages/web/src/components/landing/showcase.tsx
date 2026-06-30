'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { CopyButton } from '@/components/ui/copybutton';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';

type Lang = {
  id: string;
  label: string;
  cmd: string;
  shell: boolean;
  docsHref: string;
  ext: { label: string; href: string };
};

const LANGUAGES: Lang[] = [
  {
    id: 'ts',
    label: 'TypeScript',
    cmd: 'npm install @agentcommunity/aid',
    shell: true,
    docsHref: '/docs/quickstart/quickstart_ts',
    ext: { label: 'npm', href: 'https://www.npmjs.com/package/@agentcommunity/aid' },
  },
  {
    id: 'py',
    label: 'Python',
    cmd: 'pip install aid-discovery',
    shell: true,
    docsHref: '/docs/quickstart/quickstart_python',
    ext: { label: 'PyPI', href: 'https://pypi.org/project/aid-discovery/' },
  },
  {
    id: 'go',
    label: 'Go',
    cmd: 'import "github.com/agentcommunity/aid-go"',
    shell: false,
    docsHref: '/docs/quickstart/quickstart_go',
    ext: {
      label: 'source',
      href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-go',
    },
  },
  {
    id: 'rust',
    label: 'Rust',
    cmd: 'use aid_rs::discover;',
    shell: false,
    docsHref: '/docs/quickstart/quickstart_rust',
    ext: {
      label: 'source',
      href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-rs',
    },
  },
  {
    id: 'java',
    label: 'Java',
    cmd: 'import org.agentcommunity.aid.Discovery;',
    shell: false,
    docsHref: '/docs/quickstart/quickstart_java',
    ext: {
      label: 'source',
      href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-java',
    },
  },
  {
    id: 'dotnet',
    label: '.NET',
    cmd: 'using AidDiscovery;',
    shell: false,
    docsHref: '/docs/quickstart/quickstart_dotnet',
    ext: {
      label: 'source',
      href: 'https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-dotnet',
    },
  },
];

const TOOLS = [
  {
    name: 'Core Engine',
    blurb: 'Pure discovery, validation, and identity logic.',
    href: 'https://www.npmjs.com/package/@agentcommunity/aid-engine',
  },
  {
    name: 'AID Doctor (CLI)',
    blurb: 'Validate and generate records from the terminal.',
    href: '/docs/tooling/aid_doctor',
  },
  {
    name: 'Conformance Suite',
    blurb: 'Golden fixtures and a cross-language parity runner.',
    href: 'https://www.npmjs.com/package/@agentcommunity/aid-conformance',
  },
  {
    name: 'Web Workbench',
    blurb: 'Resolve and generate records in the browser. No install.',
    href: '/workbench',
  },
  {
    name: 'More tooling',
    blurb: 'Planned. Open a PR.',
    href: 'https://github.com/agentcommunity/agent-identity-discovery',
  },
];

export function Toolkit() {
  const [langId, setLangId] = useState('ts');
  const lang = LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];

  return (
    <section className="section-padding border-t border-border">
      <div className="container mx-auto container-padding">
        <div className="mx-auto max-w-4xl">
          <SectionHeader
            eyebrow="Tooling"
            title="Developer toolkit"
            lede="SDKs in six languages, plus a CLI, a conformance suite, and a browser workbench."
          />

          {/* SDKs */}
          <Reveal direction="up">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              SDKs
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              {/* language tabs */}
              <div className="flex flex-wrap gap-px border-b border-border bg-border">
                {LANGUAGES.map((l) => {
                  const active = l.id === lang.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLangId(l.id)}
                      aria-pressed={active}
                      className={`flex-1 px-4 py-2.5 font-mono text-sm transition-colors duration-150 ${
                        active
                          ? 'bg-card font-medium text-foreground'
                          : 'bg-muted/40 text-muted-foreground hover:bg-card/60'
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
              {/* install line */}
              <div className="flex items-center justify-between gap-4 bg-card px-4 py-4 font-mono text-sm">
                <span className="truncate">
                  {lang.shell ? <span className="text-muted-foreground/50">$ </span> : null}
                  <span className="text-foreground">{lang.cmd}</span>
                </span>
                <CopyButton textToCopy={lang.cmd} />
              </div>
              {/* links */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-card px-4 py-2.5">
                <Link
                  href={lang.docsHref}
                  className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Quickstart
                  <ArrowRight className="h-3 w-3" />
                </Link>
                <Link
                  href={lang.ext.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {lang.ext.label}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </Reveal>

          {/* Tools */}
          <Reveal direction="up" delay={100} className="mt-12">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Tools
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {TOOLS.map((tool) => (
                <li key={tool.name}>
                  <Link
                    href={tool.href}
                    target={tool.href.startsWith('http') ? '_blank' : undefined}
                    rel={tool.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="font-medium text-foreground">{tool.name}</span>
                      <span className="text-sm text-muted-foreground">{tool.blurb}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
