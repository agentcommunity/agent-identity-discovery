/**
 * MkDocs syntax preprocessor.
 *
 * Converts MkDocs-specific markdown patterns into standard HTML/markdown
 * that next-mdx-remote can render. Handles admonitions, button class
 * annotations, internal .md links, and external link rewrites.
 */

/** Convert MkDocs admonitions to HTML callout divs. */
function convertAdmonitions(content: string): string {
  // Match `!!! type` or `!!! type "Title"`
  // Followed by indented content lines (4 spaces or 1 tab)
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const admonitionMatch = lines[i].match(
      /^!!!\s+(tip|info|warning|note|user|agent)\s*(?:"([^"]*)")?/,
    );
    if (admonitionMatch) {
      const type = admonitionMatch[1];
      const title = admonitionMatch[2] ?? '';
      const bodyLines: string[] = [];
      i++;

      // Collect indented body lines (4 spaces or tab)
      while (i < lines.length && /^(?:\s{4}|\t)/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^(?:\s{4}|\t)/, ''));
        i++;
      }

      const titleAttr = title ? ` data-title="${title}"` : '';
      result.push(
        `<div className="callout callout-${type}"${titleAttr}>`,
        '',
        ...bodyLines,
        '',
        '</div>',
      );
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

/** Strip MkDocs button class annotations: `{ .md-button ... }` */
function stripButtonAnnotations(content: string): string {
  return content.replaceAll(/\{[^}]*\.md-button[^}]*\}/g, '');
}

/** Strip MkDocs target annotations like `target="\_blank"` from link suffixes */
function stripTargetAnnotations(content: string): string {
  return content.replaceAll(/\{\s*target="[^"]*"\s*\}/g, '');
}

/**
 * Convert internal .md links to /docs/ routes.
 *
 * Handles patterns like:
 *   - `specification.md` → `/docs/specification`
 *   - `./quickstart_ts.md` → `/docs/quickstart/quickstart_ts`  (context-dependent)
 *   - `../specification.md` → `/docs/specification`
 *   - `Reference/identity_pka.md` → `/docs/Reference/identity_pka`
 *   - `quickstart/index.md#anchor` → `/docs/quickstart#anchor`
 */
function convertInternalLinks(content: string, currentSlug: string): string {
  // Match markdown links: [text](url) where url ends in .md or .md#anchor
  return content.replaceAll(
    /\[([^\]]*)\]\(([^)]*\.md(?:#[^)]*)?)\)/g,
    (_match, text: string, href: string) => {
      // Skip fully-qualified URLs (http/https)
      if (/^https?:\/\//.test(href)) return _match;

      // Split anchor from path
      const [pathPart, anchor] = href.split('#');

      // Resolve relative path based on current slug's directory
      const currentDir = currentSlug.includes('/')
        ? currentSlug.slice(0, currentSlug.lastIndexOf('/'))
        : '';

      let resolved = pathPart;

      if (resolved.startsWith('./')) {
        resolved = resolved.slice(2);
        if (currentDir) resolved = `${currentDir}/${resolved}`;
      } else if (resolved.startsWith('../')) {
        // Walk up from current directory
        const parts = currentDir.split('/').filter(Boolean);
        let rel = resolved;
        while (rel.startsWith('../')) {
          parts.pop();
          rel = rel.slice(3);
        }
        resolved = parts.length > 0 ? `${parts.join('/')}/${rel}` : rel;
      } else if (!resolved.includes('/') && currentDir) {
        // Simple filename in the same directory
        resolved = `${currentDir}/${resolved}`;
      }

      // Strip .md extension
      resolved = resolved.replace(/\.md$/, '');

      // Strip /index suffix (quickstart/index → quickstart)
      resolved = resolved.replace(/\/index$/, '');

      // Skip links that navigate outside docs (e.g., ../protocol/constants.yml)
      if (resolved.startsWith('../') || resolved.includes('..')) return _match;

      const anchorSuffix = anchor ? `#${anchor}` : '';
      return `[${text}](/docs/${resolved}${anchorSuffix})`;
    },
  );
}

/** Convert GitHub raw markdown links to internal API or remove "View raw" lines */
function convertRawLinks(content: string): string {
  return content.replaceAll(
    /\[View raw markdown\]\(https:\/\/github\.com\/agentcommunity\/agent-identity-discovery\/raw\/main\/packages\/docs\/[^)]*\)\n?/g,
    '',
  );
}

/** Convert external workbench links to internal */
function convertWorkbenchLinks(content: string): string {
  return content.replaceAll('https://aid.agentcommunity.org/workbench', '/workbench');
}

/** Convert external docs links to internal */
function convertExternalDocsLinks(content: string): string {
  return content
    .replaceAll('https://docs.agentcommunity.org/aid/', '/docs/')
    .replaceAll('https://docs.agentcommunity.org/aid', '/docs');
}

/**
 * Full preprocessing pipeline.
 * Takes raw markdown content and the current page slug (for relative link resolution).
 */
export function preprocessMarkdown(content: string, currentSlug: string): string {
  let result = content;
  result = convertRawLinks(result);
  result = convertExternalDocsLinks(result);
  result = convertWorkbenchLinks(result);
  result = stripButtonAnnotations(result);
  result = stripTargetAnnotations(result);
  result = convertInternalLinks(result, currentSlug);
  result = convertAdmonitions(result);
  return result;
}
