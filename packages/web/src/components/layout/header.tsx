'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
// Import Menu and X icons for the burger menu
import { ExternalLink, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';

// This function handles the click, updates the URL, and manually fires the event.
// Moved to the outer scope to fix the 'unicorn/consistent-function-scoping' lint error.
const handleModeChange = (newMode: 'resolver' | 'generator') => {
  const newHash = newMode === 'generator' ? '#generator' : '';
  // This check prevents errors during server-side rendering.
  if (globalThis.window !== undefined) {
    globalThis.history.replaceState(null, '', `/workbench${newHash}`);
    // Manually dispatch a hashchange event so other components can react
    globalThis.dispatchEvent(new Event('hashchange'));
  }
};

function WorkbenchModeSwitcher() {
  const [mode, setMode] = useState<'resolver' | 'generator'>('resolver');

  // This effect listens for hash changes to keep the switcher UI in sync
  useEffect(() => {
    const handleHashChange = () => {
      const hash = globalThis.location.hash.slice(1);
      setMode(hash === 'generator' ? 'generator' : 'resolver');
    };

    handleHashChange(); // Set initial state
    globalThis.addEventListener('hashchange', handleHashChange);
    return () => globalThis.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="inline-flex rounded-lg border bg-muted p-1">
      <Button
        variant={mode === 'resolver' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => handleModeChange('resolver')}
        className="w-24 rounded-md transition-all duration-200"
      >
        Resolve
      </Button>
      <Button
        variant={mode === 'generator' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => handleModeChange('generator')}
        className="w-24 rounded-md transition-all duration-200"
      >
        Generate
      </Button>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const isWorkbench = pathname === '/workbench';

  // State for controlling the mobile menu visibility
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close mobile menu on pathname change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const navigation = [
    { name: 'Docs', href: 'https://docs.agentcommunity.org/aid', external: true },
    {
      name: 'GitHub',
      href: 'https://github.com/agentcommunity/agent-identity-discovery',
      external: true,
    },
  ];

  const centeredLink = {
    name: 'Pre-register for a .agent domain',
    href: 'https://agentcommunity.org',
    external: true,
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-soft shadow-soft">
      <div className="container flex h-16 items-center justify-between">
        {/* === Left Side: Logo === */}
        <Logo className="flex-shrink-0" asLink />

        {/* === Center: Workbench Switcher or Centered Link === */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden sm:flex">
          {isWorkbench ? (
            <WorkbenchModeSwitcher />
          ) : (
            <Link
              href={centeredLink.href}
              target={centeredLink.external ? '_blank' : undefined}
              rel={centeredLink.external ? 'noopener noreferrer' : undefined}
              className="transition-all duration-200 hover:text-foreground flex items-center gap-1 hover:scale-105 text-sm font-medium text-muted-foreground"
            >
              {centeredLink.name}
              {centeredLink.external && <ExternalLink className="h-3 w-3" />}
            </Link>
          )}
        </div>

        {/* === Right Side: Nav, Buttons, and Mobile Toggles === */}
        <div className="flex items-center gap-2">
          {/* --- Desktop Navigation --- */}
          <nav className="hidden sm:flex items-center space-x-6 text-sm font-medium">
            {/* Add centered link before Docs on workbench page */}
            {isWorkbench && (
              <Link
                href={centeredLink.href}
                target={centeredLink.external ? '_blank' : undefined}
                rel={centeredLink.external ? 'noopener noreferrer' : undefined}
                className="transition-all duration-200 hover:text-foreground flex items-center gap-1 hover:scale-105 text-muted-foreground"
              >
                {centeredLink.name}
                {centeredLink.external && <ExternalLink className="h-3 w-3" />}
              </Link>
            )}
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                className="transition-all duration-200 hover:text-foreground flex items-center gap-1 hover:scale-105 text-muted-foreground"
              >
                {item.name}
                {item.external && <ExternalLink className="h-3 w-3" />}
              </Link>
            ))}
          </nav>

          {/* --- Desktop Workbench Button --- */}
          <div className="hidden sm:flex pl-4">
            {isWorkbench ? null : ( // <Button disabled className="shadow-soft-md">Workbench</Button> // as the switcher already indicates the page. You can re-enable if desired. // This button is now hidden on the workbench page to reduce clutter,
              <Button
                asChild
                className="bg-primary text-primary-foreground hover:text-primary-foreground hover:bg-primary-hover shadow-soft-md hover:shadow-soft-lg transition-all duration-300 hover:scale-105"
              >
                <Link href="/workbench">Try the Workbench</Link>
              </Button>
            )}
          </div>

          {/* --- Mobile View: Switcher + Burger Menu --- */}
          <div className="flex sm:hidden items-center gap-2">
            {isWorkbench && <WorkbenchModeSwitcher />}
            <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="sr-only">Toggle menu</span>
            </Button>
          </div>
        </div>
      </div>

      {/* === Mobile Menu Panel === */}
      {isMenuOpen && (
        <div className="sm:hidden bg-background/95 backdrop-blur-soft border-t">
          <nav className="container flex flex-col items-start space-y-4 py-4">
            {/* Add centered link before Docs on workbench page */}
            {isWorkbench && (
              <Link
                href={centeredLink.href}
                target={centeredLink.external ? '_blank' : undefined}
                rel={centeredLink.external ? 'noopener noreferrer' : undefined}
                className="text-lg font-medium text-foreground hover:text-primary flex items-center gap-1.5"
                onClick={() => setIsMenuOpen(false)} // Close menu on click
              >
                {centeredLink.name}
                {centeredLink.external && <ExternalLink className="h-4 w-4" />}
              </Link>
            )}
            {/* Centered link at top for non-workbench pages */}
            {!isWorkbench && (
              <Link
                href={centeredLink.href}
                target={centeredLink.external ? '_blank' : undefined}
                rel={centeredLink.external ? 'noopener noreferrer' : undefined}
                className="text-lg font-medium text-foreground hover:text-primary flex items-center gap-1.5"
                onClick={() => setIsMenuOpen(false)} // Close menu on click
              >
                {centeredLink.name}
                {centeredLink.external && <ExternalLink className="h-4 w-4" />}
              </Link>
            )}
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                className="text-lg font-medium text-foreground hover:text-primary flex items-center gap-1.5"
                onClick={() => setIsMenuOpen(false)} // Close menu on click
              >
                {item.name}
                {item.external && <ExternalLink className="h-4 w-4" />}
              </Link>
            ))}
            {!isWorkbench && (
              <Button
                asChild
                className="w-full bg-primary text-primary-foreground hover:text-primary-foreground hover:bg-primary-hover shadow-soft-md"
                onClick={() => setIsMenuOpen(false)} // Close menu on click
              >
                <Link href="/workbench">Try the Workbench</Link>
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
