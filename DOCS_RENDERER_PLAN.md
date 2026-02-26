# Docs Renderer Implementation Plan — Continuation

## Status: Phases 1, 2, 6 COMPLETE. Phases 3, 4, 5, 7 REMAINING.

## Worktree Location
```
/Users/user/dev/PROJECTS/AgentCommunity/AID/.worktrees/docs-renderer
Branch: feature/docs-renderer
```

All file paths below are **relative to the worktree root** unless stated otherwise.

---

## What's Already Done

### Phase 1: Route Group Restructuring ✅
- Root `layout.tsx` slimmed: removed `<Header>`, `<Toaster>`, and `h-dvh` wrapper. Now only has html/body, fonts, globals.css, json-ld.
- Created `(main)/layout.tsx` with `h-dvh` wrapper, `<Header>`, `<Toaster>`.
- Moved `page.tsx` → `(main)/page.tsx`
- Moved `workbench/` → `(main)/workbench/`
- Created empty `docs/[[...slug]]/` directory (no page files yet)

### Phase 2: Dependencies & Config ✅
- Installed: `next-mdx-remote@6.0.0`, `gray-matter@4.0.3`, `remark-gfm@4.0.1`, `rehype-slug@6.0.0`, `rehype-autolink-headings@7.1.0`
- Updated `next.config.js` with webpack watchOptions for `packages/docs`

### Phase 6: meta.json Files ✅
Created ordering files:
- `packages/docs/meta.json` — root pages + group ordering
- `packages/docs/quickstart/meta.json` — 11 quickstart pages
- `packages/docs/Reference/meta.json` — 6 reference pages
- `packages/docs/Tooling/meta.json` — 3 tooling pages

---

## What Remains

### Phase 3: Docs Engine (src/lib/docs/)

Create 3 files under `packages/web/src/lib/docs/`:

#### 3A. `content.ts` — File-system content loader

```typescript
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// DOCS_DIR must resolve to packages/docs from the web package
// In the monorepo: ../../docs (relative to packages/web)
const DOCS_DIR = path.resolve(process.cwd(), '..', 'docs');

export interface DocPage {
  slug: string;          // e.g. "quickstart/quickstart_ts"
  title: string;         // from frontmatter
  description: string;   // from frontmatter
  content: string;       // raw markdown (after preprocessing)
  rawContent: string;    // original raw markdown (for API endpoint)
  headings: Heading[];   // extracted for TOC
}

export interface Heading {
  depth: number;    // 2-6 (skip h1, it's the title)
  text: string;
  id: string;       // slugified for anchor links
}

// Get all doc pages
export function getAllDocSlugs(): string[] { ... }

// Get a single doc by slug
export function getDocBySlug(slug: string): DocPage | null { ... }

// Get all docs (for sitemap, llms.txt)
export function getAllDocs(): DocPage[] { ... }

// Extract headings from markdown for TOC
function extractHeadings(content: string): Heading[] { ... }

// Convert file path to slug: "quickstart/quickstart_ts.md" → "quickstart/quickstart_ts"
function pathToSlug(filePath: string): string { ... }
```

**Key details:**
- The `DOCS_DIR` path: when Next.js runs from `packages/web`, `process.cwd()` = `packages/web`, so use `path.resolve(process.cwd(), '..', 'docs')` or `path.join(process.cwd(), '../../packages/docs')`. Test which works in both dev and build — likely need: `path.resolve(__dirname, '../../../../packages/docs')` or use an env variable. Safest approach:
  ```typescript
  const DOCS_DIR = path.resolve(process.cwd(), 'packages', 'docs');
  // This works if cwd is the monorepo root during build
  // But Next.js 16 sets cwd to packages/web, so use:
  const DOCS_DIR = path.join(process.cwd(), '..', 'docs');
  ```
  Best to test both. When `output: 'standalone'`, `process.cwd()` in build is `packages/web`.

- Recursively walk `DOCS_DIR`, skip `meta.json`, `export-manifest.*`
- Use `gray-matter` to parse frontmatter from each `.md` file
- The `content` field should have the MkDocs preprocessing applied (from `markdown.ts`)
- The `rawContent` field should be the unprocessed markdown (for the API endpoint)

#### 3B. `navigation.ts` — Sidebar structure

```typescript
import fs from 'fs';
import path from 'path';
import { getAllDocs, DocPage } from './content';

export interface NavItem {
  title: string;
  slug: string;
  children?: NavItem[];
}

export interface NavGroup {
  title: string;
  slug: string;
  items: NavItem[];
}

export interface Navigation {
  rootPages: NavItem[];
  groups: NavGroup[];
}

export function getNavigation(): Navigation { ... }
```

**Key details:**
- Read `meta.json` from each directory
- Root meta.json has `pages` (root-level pages) and `groups` (subfolders)
- Each subfolder meta.json has `title` and `pages` (ordered page slugs)
- Use page title from frontmatter for display
- Fallback to alphabetical if meta.json is missing

#### 3C. `markdown.ts` — MkDocs syntax preprocessor

```typescript
export function preprocessMarkdown(content: string): string { ... }
```

**Must handle:**

1. **Admonitions** — Convert MkDocs `!!! type "Title"\n    content` to HTML divs:
   ```
   !!! tip "Title"
       Content here
       More content
   ```
   →
   ```html
   <div class="callout callout-tip" data-title="Title">
   Content here
   More content
   </div>
   ```
   Types used in docs: `tip`, `info`, `warning`, `note`, `user`, `agent`

2. **Button class annotations** — Strip `{ .md-button .md-button--secondary }` and similar class annotations from links

3. **Internal .md links** — Convert `specification.md` → `/docs/specification`, `./quickstart_ts.md` → `/docs/quickstart/quickstart_ts`, `../specification.md` → `/docs/specification`

4. **MkDocs target annotations** — Strip `target="\_blank"` from link annotations

5. **Self-referencing raw links** — Convert `https://github.com/agentcommunity/agent-identity-discovery/raw/main/packages/docs/X.md` → `/api/docs/X` (or just remove these "View raw markdown" lines)

6. **External workbench links** — Convert `https://aid.agentcommunity.org/workbench` → `/workbench`

---

### Phase 4: Docs UI Components

Create files under `packages/web/src/components/docs/` and `packages/web/src/app/docs/`:

#### 4A. `callout.tsx` — Styled callout/admonition box

```tsx
// Types: tip, info, warning, note, user, agent
// Rendered from the preprocessed admonition HTML
// Match site aesthetic with colored left border + icon
interface CalloutProps {
  type: 'tip' | 'info' | 'warning' | 'note' | 'user' | 'agent';
  title?: string;
  children: React.ReactNode;
}
```

Colors per type:
- `tip` — green (emerald)
- `info` — blue
- `warning` — amber/orange
- `note` — gray/slate
- `user` — purple
- `agent` — cyan/teal

#### 4B. `toc.tsx` — Table of contents (right sidebar)

```tsx
// Receives headings array from the doc page
// Scroll-spy highlighting using IntersectionObserver
// Sticky position on desktop (lg:)
// Hidden on mobile (shown inline at top instead, or collapsed)
interface TocProps {
  headings: Heading[];
}
```

#### 4C. `docs-sidebar.tsx` — Navigation sidebar (left)

```tsx
// Receives Navigation from getNavigation()
// Collapsible folder groups (default: current group open)
// Active page highlighting based on pathname
// Search: simple client-side filter on page titles
// Mobile: overlay triggered by hamburger
```

#### 4D. `ai-toolbar.tsx` — AI-first toolbar (per page)

```tsx
// Horizontal bar above or below the article content
// Buttons:
// - Copy Markdown — copies raw .md to clipboard (uses rawContent prop)
// - Open in ChatGPT — https://chatgpt.com/?q=<encoded>
// - Open in Claude — https://claude.ai/new?q=<encoded>
// - View Raw — /api/docs/{slug} link
// - View on GitHub — https://github.com/agentcommunity/agent-identity-discovery/blob/main/packages/docs/{slug}.md
```

#### 4E. `mdx-components.tsx` — Custom MDX component overrides

```tsx
// Map standard HTML elements to styled components:
// - h1-h6: with anchor links (rehype-autolink-headings handles this)
// - pre/code: with copy button (reuse existing copybutton pattern if exists, or create simple one)
// - table: wrapped in horizontal scroll container
// - a: internal vs external link detection (internal = Next.js Link, external = target="_blank")
// - div.callout: render as <Callout> component
// - img: Next.js Image if local, regular img if external
```

#### 4F. `docs-layout.tsx` — Main docs layout wrapper

The layout component wrapping all docs pages. Three-column on desktop:
- Left: sidebar (sticky, 280px width)
- Center: article content (max-width prose)
- Right: TOC (sticky, 220px width, hidden on < lg)

Mobile: sidebar is a sheet/overlay, TOC is inline at top of article.

#### 4G. App routes

**`packages/web/src/app/docs/layout.tsx`:**
```tsx
// Scrollable docs layout (NOT h-dvh)
// Import Header (reuse from components/layout/header)
// Wrap children in docs-layout with sidebar
import { Header } from '@/components/layout/header';
import { DocsLayout } from '@/components/docs/docs-layout';
import { getNavigation } from '@/lib/docs/navigation';

export default function Layout({ children }) {
  const navigation = getNavigation();
  return (
    <>
      <Header />
      <DocsLayout navigation={navigation}>
        {children}
      </DocsLayout>
    </>
  );
}
```

**`packages/web/src/app/docs/page.tsx`:**
```tsx
// Docs index/landing page
// Show overview, link to key sections
// Import from getDocBySlug('index') and render it
// Or show a curated landing with cards for each section
```

**`packages/web/src/app/docs/[[...slug]]/page.tsx`:**
```tsx
import { getDocBySlug, getAllDocSlugs } from '@/lib/docs/content';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { preprocessMarkdown } from '@/lib/docs/markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { mdxComponents } from '@/components/docs/mdx-components';
import { AiToolbar } from '@/components/docs/ai-toolbar';
import { Toc } from '@/components/docs/toc';

// generateStaticParams for SSG
export async function generateStaticParams() {
  return getAllDocSlugs().map(slug => ({
    slug: slug.split('/'),
  }));
}

export default async function DocPage({ params }) {
  const slug = (await params).slug?.join('/') || 'index';
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  return (
    <article>
      <h1>{doc.title}</h1>
      <AiToolbar slug={slug} rawContent={doc.rawContent} />
      <MDXRemote
        source={doc.content}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
          },
        }}
        components={mdxComponents}
      />
    </article>
  );
  // The Toc is rendered by the layout based on doc.headings
}

// Metadata
export async function generateMetadata({ params }) {
  const slug = (await params).slug?.join('/') || 'index';
  const doc = getDocBySlug(slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/docs/${slug}` },
  };
}
```

**Important implementation notes:**
- `next-mdx-remote` v6 uses `MDXRemote` from `next-mdx-remote/rsc` for server components
- The docs use standard `.md` (not `.mdx`), so the preprocessor converts MkDocs syntax to HTML that MDX can handle
- The callout divs from the preprocessor get picked up by the `div` component override in `mdxComponents`
- Need to handle the case where `slug` is `undefined` (docs index page = `packages/docs/index.md`)

---

### Phase 5: AI Scraper Friendliness

#### 5A. `packages/web/src/app/api/docs/[...slug]/route.ts` — Raw markdown API

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDocBySlug } from '@/lib/docs/content';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const slugStr = slug.join('/');
  const doc = getDocBySlug(slugStr);

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get('format');

  if (format === 'json') {
    return NextResponse.json({
      title: doc.title,
      description: doc.description,
      content: doc.rawContent,
      headings: doc.headings,
    });
  }

  // Default: raw markdown
  return new NextResponse(doc.rawContent, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

#### 5B. `packages/web/public/llms.txt` — AI crawler discovery

```
# Agent Identity & Discovery (AID) Documentation
# https://aid.agentcommunity.org/docs
# Last updated: 2025-08-31

## Overview
> AID is a DNS-based discovery protocol for the agentic web.
> Given a domain, query _agent.<domain> TXT record to find its agent endpoint.

## Documentation Pages

- [Agent Identity & Discovery](/docs): Overview and introduction
- [Specification](/docs/specification): Full protocol specification (v1.1)
- [Design Rationale](/docs/rationale): Why AID was designed this way
- [Security](/docs/security): Security considerations
- [Versioning](/docs/versioning): Protocol versioning strategy

### Quick Start
- [Quick Start Overview](/docs/quickstart): Getting started guide
- [TypeScript / Node.js](/docs/quickstart/quickstart_ts): Node.js SDK
- [Go](/docs/quickstart/quickstart_go): Go SDK
- [Python](/docs/quickstart/quickstart_python): Python SDK
- [Rust](/docs/quickstart/quickstart_rust): Rust SDK
- [Java](/docs/quickstart/quickstart_java): Java SDK
- [.NET](/docs/quickstart/quickstart_dotnet): .NET SDK
- [Browser](/docs/quickstart/quickstart_browser): Browser SDK
- [MCP Protocol](/docs/quickstart/quickstart_mcp): MCP integration
- [A2A Protocol](/docs/quickstart/quickstart_a2a): A2A integration
- [OpenAPI](/docs/quickstart/quickstart_openapi): OpenAPI integration

### Reference
- [Discovery API](/docs/Reference/discovery_api): API reference
- [Protocols](/docs/Reference/protocols): Supported protocols
- [Identity & PKA](/docs/Reference/identity_pka): Public key attestation
- [Well-Known JSON](/docs/Reference/well_known_json): .well-known fallback
- [Troubleshooting](/docs/Reference/troubleshooting): Common issues
- [What's New](/docs/Reference/whats_new): Changelog

### Tooling
- [aid-doctor CLI](/docs/Tooling/aid_doctor): CLI diagnostic tool
- [aid-engine](/docs/Tooling/aid_engine): Core business logic engine
- [Conformance Suite](/docs/Tooling/conformance): Testing conformance

## Raw Markdown API
Each page is available as raw markdown at /api/docs/{slug}
Example: /api/docs/specification
Add ?format=json for structured JSON with title, description, content, and headings.
```

#### 5C. Update `sitemap.ts`

Add all doc routes to the sitemap:

```typescript
import { getAllDocSlugs } from '@/lib/docs/content';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const docRoutes = getAllDocSlugs().map(slug => ({
    url: `${siteUrl}/docs/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: slug === 'index' ? 0.9 : 0.7,
  }));

  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/workbench`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    ...docRoutes,
  ];
}
```

#### 5D. Semantic HTML & Schema.org

In the `[[...slug]]/page.tsx`, wrap content with:
```html
<article itemScope itemType="https://schema.org/TechArticle">
  <meta itemProp="name" content={doc.title} />
  <meta itemProp="description" content={doc.description} />
  ...
</article>
```

---

### Phase 7: Replace External Doc Links

Pattern: `https://docs.agentcommunity.org/aid/X` → `/docs/X`

**Files to update (all in `packages/web/src/`):**

1. **`components/layout/header.tsx:73`** — Change `href: 'https://docs.agentcommunity.org/aid'` to `href: '/docs'` and `external: true` to `external: false`

2. **`components/landing/hero.tsx`** — 1 link: `https://docs.agentcommunity.org/aid/specification` → `/docs/specification`

3. **`components/landing/quick-start.tsx`** — 8 links:
   - `https://docs.agentcommunity.org/aid/quickstart/index` → `/docs/quickstart`
   - `https://docs.agentcommunity.org/aid/specification` → `/docs/specification`
   - `https://docs.agentcommunity.org/aid/Tooling/aid_doctor` → `/docs/Tooling/aid_doctor`
   - `https://docs.agentcommunity.org/aid/Tooling/aid_engine` → `/docs/Tooling/aid_engine`
   - `https://docs.agentcommunity.org/aid/Tooling/conformance` → `/docs/Tooling/conformance`
   - `https://docs.agentcommunity.org/aid/Reference/identity_pka` → `/docs/Reference/identity_pka`
   - `https://docs.agentcommunity.org/aid` → `/docs`

4. **`components/landing/solution.tsx`** — 10 links (all the href values in the solutions array)

5. **`components/landing/identity.tsx`** — PKA link

6. **`components/landing/showcase.tsx`** — SDK doc links

7. **`components/layout/footer.tsx`** — 13 doc links

8. **`components/workbench/v11-fields/security-fields.tsx`** — PKA link

9. **`generated/examples.ts`** — Example doc links

**Also update**: links in these files that use `target="_blank"` and `rel="noopener noreferrer"` should remove those attributes since they're now internal links. The solution.tsx file for example has `target="_blank"` and `rel="noopener noreferrer"` on all doc links.

**Simple approach**: Use find-and-replace `https://docs.agentcommunity.org/aid/` → `/docs/` and `https://docs.agentcommunity.org/aid` → `/docs` across all files. Then fix up the `external: true` → `external: false` in header.tsx and remove `target="_blank"`/`rel="noopener noreferrer"` from links that are now internal.

---

## Existing File Contents (for reference)

### Current `packages/web/src/app/layout.tsx` (already modified):
```tsx
// Slim root layout - html/body, fonts, json-ld, globals.css
// NO Header, NO Toaster, NO h-dvh wrapper
// Children rendered directly in body
```

### Current `packages/web/src/app/(main)/layout.tsx` (already created):
```tsx
import { Toaster } from 'sonner';
import { Header } from '@/components/layout/header';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header />
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      <Toaster />
    </div>
  );
}
```

### MkDocs Patterns Found in Docs:
- Admonitions: `!!! user "Title"`, `!!! agent "Title"`, `!!! tip "Title"`, `!!! warning`, `!!! note`, `!!! info`
- Button classes: `{ .md-button .md-button--secondary target="\_blank" }`
- Internal links: `./quickstart_ts.md`, `../specification.md`, `specification.md`
- Frontmatter: `title`, `description`, `icon` (material icons, not used in our render), `extra_css_class`, `tags`
- Mermaid diagrams: ` ```mermaid ` blocks (may need special handling or skip for v1)
- GitHub raw links: `[View raw markdown](https://github.com/agentcommunity/...)`

### Docs files (25 total):
```
packages/docs/
├── index.md
├── specification.md
├── rationale.md
├── security.md
├── versioning.md
├── quickstart/
│   ├── index.md
│   ├── quickstart_ts.md
│   ├── quickstart_go.md
│   ├── quickstart_python.md
│   ├── quickstart_rust.md
│   ├── quickstart_java.md
│   ├── quickstart_dotnet.md
│   ├── quickstart_browser.md
│   ├── quickstart_mcp.md
│   ├── quickstart_a2a.md
│   └── quickstart_openapi.md
├── Reference/
│   ├── discovery_api.md
│   ├── protocols.md
│   ├── identity_pka.md
│   ├── well_known_json.md
│   ├── troubleshooting.md
│   └── whats_new.md
└── Tooling/
    ├── aid_doctor.md
    ├── aid_engine.md
    └── conformance.md
```

### Design System (from globals.css):
- HSL color variables: `--background`, `--foreground`, `--card`, `--primary`, `--muted`, etc.
- Dark mode: `.dark` class with overridden HSL values
- Shadows: `shadow-soft-xs` through `shadow-soft-xl`
- Gradient: `--gradient-start: #FF1E56`, `--gradient-end: #0196FF`
- Existing prose-like styles for `h1-h6`, `p`, `code`, `pre`, `a`
- The globals.css already has base styles for headings, code blocks, etc. — the docs prose should build on these but may need scoping (e.g., `.prose` class or similar)

---

## Verification Checklist

After all phases complete:

1. `pnpm -C packages/web build` — zero errors
2. Smoke test with `pnpm -C packages/web dev`:
   - `/` landing page renders, all links point to `/docs/*`
   - `/workbench` works normally
   - `/docs` shows index with sidebar navigation
   - `/docs/specification` renders the full spec with TOC
   - `/docs/quickstart/quickstart_ts` renders with code blocks
   - AI toolbar works: copy markdown, open in AI links, view raw
   - `/api/docs/specification` returns raw markdown
   - Mobile responsive: sidebar collapses to hamburger
3. `pnpm lint` passes
4. `pnpm -C packages/web test` passes

---

## Implementation Order for Next Agent

Execute in this order:
1. **Phase 3** (docs engine) — no UI dependencies, pure logic
2. **Phase 5A** (API route) — uses docs engine, simple server code
3. **Phase 4** (UI components + app routes) — depends on Phase 3
4. **Phase 5B-D** (llms.txt, sitemap, schema.org) — small additions
5. **Phase 7** (link replacements) — do last, bulk find-replace
6. **Verify** — build, lint, smoke test
