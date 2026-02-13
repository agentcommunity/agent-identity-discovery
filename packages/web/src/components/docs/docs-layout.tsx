'use client';

import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocsSidebar } from './docs-sidebar';
import type { Navigation } from '@/lib/docs';

interface DocsLayoutProps {
  navigation: Navigation;
  children: React.ReactNode;
}

export function DocsLayout({ navigation, children }: DocsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Mobile sidebar toggle */}
      <Button
        variant="default"
        size="icon"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-4 right-4 z-50 lg:hidden h-10 w-10 rounded-full shadow-soft-lg"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        <span className="sr-only">Toggle docs sidebar</span>
      </Button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSidebarOpen(false);
          }}
          role="button"
          tabIndex={0}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-72 bg-background border-r border-border overflow-y-auto pt-20 pb-8 px-4
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:inset-auto lg:z-auto lg:transform-none lg:pt-6 lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <DocsSidebar navigation={navigation} />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
