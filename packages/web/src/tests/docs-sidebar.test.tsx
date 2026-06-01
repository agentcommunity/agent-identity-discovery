import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DocsSidebar } from '@/components/docs/docs-sidebar';
import type { Navigation } from '@/lib/docs';

vi.mock('next/navigation', () => ({
  usePathname: () => '/docs/specification',
}));

const navigation: Navigation = {
  rootPages: [
    { title: 'Agent Identity & Discovery (AID)', slug: '' },
    { title: 'Specification', slug: 'specification' },
  ],
  groups: [
    {
      title: 'Understand',
      slug: 'Understand',
      items: [{ title: 'Core Concepts', slug: 'Understand/concepts' }],
    },
    {
      title: 'Reference',
      slug: 'Reference',
      items: [{ title: 'PKA Endpoint Proof', slug: 'Reference/pka' }],
    },
  ],
};

describe('DocsSidebar', () => {
  it('renders docs groups open by default on root specification pages', () => {
    const html = renderToStaticMarkup(<DocsSidebar navigation={navigation} />);

    expect(html).toContain('Core Concepts');
    expect(html).toContain('PKA Endpoint Proof');
    expect(html).toContain('href="/docs/reference/pka"');
  });

  it('gives the landing and specification links stronger root-page styling', () => {
    const html = renderToStaticMarkup(<DocsSidebar navigation={navigation} />);

    expect(html).toContain('border border-border');
    expect(html).toContain('font-semibold');
  });
});
