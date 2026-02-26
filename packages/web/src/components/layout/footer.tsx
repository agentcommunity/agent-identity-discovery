import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background/95 backdrop-blur-soft shadow-soft-xs">
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">AID</h3>
            <p className="text-sm text-muted-foreground">
              Universal standard for AI agent discovery via DNS
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Documentation</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Getting Started
                </p>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/docs/quickstart"
                      className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                    >
                      Quick Start
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/docs/specification"
                      className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                    >
                      Specification
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/docs/rationale"
                      className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                    >
                      Design Rationale
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  SDKs & Tools
                </p>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/docs/quickstart/quickstart_ts"
                      className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                    >
                      TypeScript
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/docs/quickstart/quickstart_go"
                      className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                    >
                      Go
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/docs/quickstart/quickstart_python"
                      className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                    >
                      Python
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/docs/Tooling/aid_doctor"
                      className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                    >
                      CLI Tool
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Reference
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Link
                  href="/docs/Reference/discovery_api"
                  className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                >
                  Discovery API
                </Link>
                <Link
                  href="/docs/Reference/identity_pka"
                  className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                >
                  Identity & PKA
                </Link>
                <Link
                  href="/docs/Reference/protocols"
                  className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                >
                  Protocols
                </Link>
                <Link
                  href="/docs/security"
                  className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                >
                  Security
                </Link>
                <Link
                  href="/docs/Reference/troubleshooting"
                  className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                >
                  Troubleshooting
                </Link>
                <Link
                  href="/docs/versioning"
                  className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                >
                  Versioning
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Community</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="https://agentcommunity.org/auth/sign-in"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center transition-all duration-200 hover:translate-x-1 group"
                  target="_blank"
                >
                  Join Community
                  <ExternalLink className="ml-1 h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
              <li>
                <Link
                  href="https://github.com/agentcommunity/agent-identity-discovery"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center transition-all duration-200 hover:translate-x-1 group"
                  target="_blank"
                >
                  GitHub
                  <ExternalLink className="ml-1 h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
              <li>
                <Link
                  href="https://github.com/agentcommunity/agent-identity-discovery/discussions"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center transition-all duration-200 hover:translate-x-1 group"
                  target="_blank"
                >
                  Discussions
                  <ExternalLink className="ml-1 h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
              <li>
                <Link
                  href="https://github.com/agentcommunity/agent-identity-discovery/issues"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center transition-all duration-200 hover:translate-x-1 group"
                  target="_blank"
                >
                  Issues
                  <ExternalLink className="ml-1 h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/workbench"
                  className="text-muted-foreground hover:text-foreground transition-all duration-200 hover:translate-x-1"
                >
                  Workbench
                </Link>
              </li>
              <li>
                <Link
                  href="https://agentcommunity.org"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center transition-all duration-200 hover:translate-x-1 group"
                  target="_blank"
                >
                  Agent Community
                  <ExternalLink className="ml-1 h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border/50 pt-6 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Agent Community. Open source under MIT license.</p>
        </div>
      </div>
    </footer>
  );
}
