import Link from 'next/link';

export function DocsFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border pt-6 pb-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          &copy; {year}{' '}
          <a
            href="https://agentcommunity.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            agentcommunity.org
          </a>
        </span>

        <div className="flex items-center gap-4">
          <a
            href="https://x.com/agentcommunity_"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            @agentcommunity_
          </a>
          <a
            href="https://discord.gg/agentcommunity"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Discord
          </a>
          <Link href="/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
        </div>
      </div>
    </footer>
  );
}
