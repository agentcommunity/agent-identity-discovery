/**
 * Heading extraction + id generation for docs.
 *
 * Heading ids MUST match the DOM ids produced at render time by `rehype-slug`
 * (which uses `github-slugger`). The docs TOC and scroll-spy look up headings by
 * `document.querySelector('#' + id)`, so any divergence between the precomputed
 * id (stored in docs-index.json) and the rendered DOM id silently breaks the
 * link and the active-section highlight.
 *
 * We therefore use the same `github-slugger` instance semantics rehype-slug
 * does: one slugger per document so that duplicate headings de-duplicate
 * identically (`foo`, `foo-1`, `foo-2`, ...).
 */
import GithubSlugger from 'github-slugger';

export interface Heading {
  depth: number; // 2–6
  text: string;
  id: string;
}

/** Strip inline markdown emphasis/code from heading text, matching the rendered text. */
function cleanHeadingText(raw: string): string {
  return raw
    .replaceAll(/`([^`]*)`/g, '$1')
    .replaceAll(/\*\*([^*]*)\*\*/g, '$1')
    .replaceAll(/\*([^*]*)\*/g, '$1')
    .trim();
}

/**
 * Extract `##`–`######` headings from raw markdown, assigning each a github-slugger
 * id. A fresh slugger is created per call so duplicate headings dedupe the same
 * way rehype-slug does within a single document.
 */
export function extractHeadings(content: string): Heading[] {
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{2,6})\s+(.+)/);
    if (match) {
      const depth = match[1].length;
      const text = cleanHeadingText(match[2]);
      headings.push({ depth, text, id: slugger.slug(text) });
    }
  }
  return headings;
}
