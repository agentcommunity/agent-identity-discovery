import { describe, expect, it } from 'vitest';
import GithubSlugger from 'github-slugger';
import { getAllDocs } from '@/lib/docs';

// docs-toc-1: the heading ids stored for the TOC must match the DOM ids
// produced at render time by rehype-slug (github-slugger). If they diverge,
// TOC links and scroll-spy silently break. This test re-derives every heading
// id with github-slugger (one slugger per document, exactly as rehype-slug
// does) and asserts the stored id matches.

describe('docs heading ids match github-slugger (rehype-slug parity)', () => {
  const docs = getAllDocs();

  it('loads docs from the generated index', () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it('every stored heading.id equals the github-slugger output for that document', () => {
    const mismatches: string[] = [];

    for (const doc of docs) {
      const slugger = new GithubSlugger();
      for (const heading of doc.headings) {
        const expected = slugger.slug(heading.text);
        if (heading.id !== expected) {
          mismatches.push(
            `${doc.slug} :: "${heading.text}" stored=${heading.id} expected=${expected}`,
          );
        }
      }
    }

    expect(mismatches, mismatches.join('\n')).toHaveLength(0);
  });
});
