'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Navigation, NavGroup } from '@/lib/docs';

interface DocsSidebarProps {
  navigation: Navigation;
}

function SidebarGroup({ group, pathname }: { group: NavGroup; pathname: string }) {
  const isActive = pathname.startsWith(`/docs/${group.slug}`);
  const [open, setOpen] = useState(isActive);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
      >
        {group.title}
        <ChevronRight
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-2">
          {group.items.map((item) => {
            const href = `/docs/${item.slug}`;
            const active = pathname === href;
            return (
              <li key={item.slug}>
                <Link
                  href={href}
                  className={cn(
                    'block rounded-md px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DocsSidebar({ navigation }: DocsSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="space-y-4">
      {/* Root pages */}
      <ul className="space-y-0.5">
        {navigation.rootPages.map((item) => {
          const href = item.slug ? `/docs/${item.slug}` : '/docs';
          const active = pathname === href;
          return (
            <li key={item.slug || 'index'}>
              <Link
                href={href}
                className={cn(
                  'block rounded-md px-2 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Groups */}
      {navigation.groups.map((group) => (
        <SidebarGroup key={group.slug} group={group} pathname={pathname} />
      ))}
    </aside>
  );
}
