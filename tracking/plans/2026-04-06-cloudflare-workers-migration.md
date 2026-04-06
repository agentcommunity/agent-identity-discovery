# AID → Cloudflare Workers Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `aid.agentcommunity.org` on Cloudflare Workers via `@opennextjs/cloudflare`, eliminating its dependency on Vercel. This is Phase 6b of the agentcommunity-page migration plan.

**Architecture:** Next.js 16.1.6 App Router app lives at `packages/web/` inside a pnpm/Turborepo monorepo. We pre-compile docs + version at build time (so runtime never touches `fs`), swap `node:crypto` for `globalThis.crypto`, drop `output: 'standalone'`, add an `open-next.config.ts` + `wrangler.jsonc`, and deploy via `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. AID has no ISR / no database / no Supabase — the wrangler config is minimal (no R2, no D1).

**Tech Stack:** Next.js 16.1.6, React 19, TypeScript strict, `@opennextjs/cloudflare`, `wrangler`, `tsx` (for build scripts), existing `gray-matter` (build-time only).

**Out of scope (do NOT touch):**
- Main site repo (`agentCommunity_PAGE`) — already migrated, auto-deploying from `cloudflare-migration`
- DMV migration — happening in parallel context
- DNS cutover for `aid.agentcommunity.org` — deferred to the coordinated migration day; this plan ends at a working workers.dev deployment
- `showcase/terraform/` provider swap — tracked in Phase 3 of the main migration plan, NOT here

---

## Reference Files (main site, for pattern matching only — read-only)

- `agentCommunity_PAGE/scripts/generate-docs-index.ts` — template for pre-compile script
- `agentCommunity_PAGE/lib/content/docs.ts` — template for require + fs-fallback runtime loader
- `agentCommunity_PAGE/open-next.config.ts` — template (ours is simpler, no cache)
- `agentCommunity_PAGE/wrangler.jsonc` — template (ours omits R2/D1)
- `agentCommunity_PAGE/next.config.ts` lines 1-5 — shows `initOpenNextCloudflareForDev()` invocation

## Current AID State (verified 2026-04-06)

**Blockers in `packages/web/src/`:**
- `lib/docs/content.ts` — `fs.existsSync`, `fs.readFileSync`, `fs.readdirSync`, `process.cwd()` (lines 8-16, 46, 92-106, 125)
- `lib/docs/navigation.ts` — `fs.readFileSync`, `fs.existsSync`, `process.cwd()` (lines 8-31, 44-49, 58, 72)
- `app/api/pka-demo/route.ts:2` — `import { webcrypto } from 'node:crypto'`
- `app/api/version/route.ts:2,12,16` — `readFile` from `fs/promises`, `process.cwd()` path traversal to `../aid/package.json`

**Consumers of `@/lib/docs` that must continue to work unchanged:**
- `app/sitemap.ts` (uses `getAllDocRouteSlugs`)
- `app/docs/layout.tsx` (uses `getNavigation`)
- `app/docs/[[...slug]]/page.tsx` (uses `getDocBySlug`, `getAllDocRouteSlugs`, + `generateStaticParams`)
- `app/api/docs/[...slug]/route.ts` (uses `getDocBySlug`)
- `components/docs/*.tsx` (type-only imports — no runtime impact)

**Runtime declarations already correct:**
- `/api/pka-demo` — `runtime = 'nodejs'` ✓
- `/api/handshake` — `runtime = 'nodejs'` ✓ (uses `aid-engine` for DNS, fetch)
- `/api/generator/validate` — `runtime = 'nodejs'` ✓
- `/api/og/docs` — `runtime = 'edge'` ✓ (matches main site pattern; `ImageResponse` works on CF)
- `/api/version`, `/api/docs/[...slug]` — no explicit runtime (defaults to nodejs) ✓

**Package layout (monorepo):**
- Root: `/Users/user/dev/PROJECTS/AgentCommunity/AID/`
- Next app: `packages/web/` — this is where we run OpenNext
- Docs source: `packages/docs/` — markdown files, referenced by `path.join(process.cwd(), '..', 'docs')` when cwd is `packages/web`
- AID SDK: `packages/aid/` — contains `package.json` with the `version` field we surface via `/api/version`
- `packages/web/src/generated/` — already exists and holds committed generated files (`spec.ts`, `examples.ts` from `pnpm gen`). We add new generated files here.

**Existing build command:** `pnpm -C packages/web build` → `next build --webpack`
**Dev command:** `pnpm -C packages/web dev` → `next dev --webpack`

---

## File Structure (new + modified)

**New files:**
- `packages/web/scripts/generate-docs-index.ts` — walks `../docs`, writes pre-compiled index JSON
- `packages/web/scripts/generate-version.ts` — reads `../aid/package.json`, writes `src/generated/version.ts`
- `packages/web/open-next.config.ts` — OpenNext Cloudflare config (minimal, no cache overrides)
- `packages/web/wrangler.jsonc` — Worker config (no R2, no D1, no DO)
- `packages/web/src/generated/docs-index.json` — generated at build time (gitignored)
- `packages/web/src/generated/version.ts` — generated at build time (gitignored)

**Modified files:**
- `packages/web/next.config.js` — remove `output: 'standalone'`, add `initOpenNextCloudflareForDev()`
- `packages/web/package.json` — add `@opennextjs/cloudflare` + `wrangler` deps, add `build`/`build:cf`/`deploy:cf`/`preview:cf`/`dev` scripts wiring the generators
- `packages/web/src/lib/docs/content.ts` — replace fs implementation with require-index-with-fs-fallback (mirrors `agentCommunity_PAGE/lib/content/docs.ts`)
- `packages/web/src/lib/docs/navigation.ts` — delete fs implementation; `getNavigation()` now reads from the pre-compiled index (navigation is built at generate time)
- `packages/web/src/app/api/pka-demo/route.ts` — swap `webcrypto` for `globalThis.crypto`
- `packages/web/src/app/api/version/route.ts` — import `AID_VERSION` from `@/generated/version`, drop fs/path
- `.gitignore` (repo root) — add `packages/web/src/generated/docs-index.json`, `packages/web/src/generated/version.ts`, `packages/web/.open-next/`, `packages/web/.wrangler/`

---

## Task 1: Baseline + Dependencies

**Files:**
- Read: `packages/web/package.json`

- [ ] **Step 1.1: Establish a pre-change baseline**

Run from repo root `/Users/user/dev/PROJECTS/AgentCommunity/AID`:

```bash
pnpm -C packages/web test 2>&1 | tail -20
pnpm -C packages/web type-check 2>&1 | tail -20
pnpm -C packages/web lint 2>&1 | tail -20
```

Expected: all three pass (or at least record current pass/fail counts). Save the test pass count as the reference number — later tasks must not regress it.

- [ ] **Step 1.2: Install OpenNext + Wrangler**

Run from repo root:

```bash
pnpm -C packages/web add -D @opennextjs/cloudflare@latest wrangler@latest
```

Expected: both appear in `packages/web/package.json` under `devDependencies`, `pnpm-lock.yaml` updated.

- [ ] **Step 1.3: Commit the dependency bump**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @opennextjs/cloudflare and wrangler"
```

---

## Task 2: Generated version module (fixes `/api/version` blocker)

**Files:**
- Create: `packages/web/scripts/generate-version.ts`
- Create: `packages/web/src/generated/version.ts` (generated output)
- Modify: `packages/web/src/app/api/version/route.ts`
- Modify: `.gitignore`

- [ ] **Step 2.1: Write `scripts/generate-version.ts`**

Create `packages/web/scripts/generate-version.ts`:

```typescript
/**
 * Pre-compiles the AID SDK version to a TypeScript constant at build time.
 *
 * At runtime on Cloudflare Workers, we cannot read `packages/aid/package.json`
 * from disk. This script reads it at build time and emits a static module that
 * the `/api/version` route imports.
 *
 * Output: packages/web/src/generated/version.ts
 */
import fs from 'node:fs';
import path from 'node:path';

function main(): void {
  // Script runs from packages/web, so aid package.json is at ../aid/package.json
  const aidPkgPath = path.resolve(__dirname, '..', '..', 'aid', 'package.json');

  let version = '0.0.0';
  try {
    const raw = fs.readFileSync(aidPkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    version = pkg.version ?? '0.0.0';
  } catch (error) {
    console.warn(`[generate-version] Failed to read ${aidPkgPath}: ${String(error)}`);
  }

  const outDir = path.resolve(__dirname, '..', 'src', 'generated');
  const outFile = path.join(outDir, 'version.ts');

  fs.mkdirSync(outDir, { recursive: true });

  const content = `// AUTO-GENERATED by scripts/generate-version.ts. Do not edit.\nexport const AID_VERSION = ${JSON.stringify(version)};\n`;
  fs.writeFileSync(outFile, content);

  console.log(`[generate-version] Wrote AID_VERSION=${version} → ${outFile}`);
}

main();
```

- [ ] **Step 2.2: Run the generator and verify the output**

```bash
pnpm -C packages/web exec tsx scripts/generate-version.ts
cat packages/web/src/generated/version.ts
```

Expected: a file like `export const AID_VERSION = "1.2.0";` (whatever version is in `packages/aid/package.json`).

- [ ] **Step 2.3: Rewrite `/api/version/route.ts` to import the generated constant**

Replace the entire contents of `packages/web/src/app/api/version/route.ts` with:

```typescript
import { NextResponse } from 'next/server';
import { AID_VERSION } from '@/generated/version';

export function GET() {
  return NextResponse.json({ version: AID_VERSION });
}
```

- [ ] **Step 2.4: Add generated files to `.gitignore`**

Append to `/Users/user/dev/PROJECTS/AgentCommunity/AID/.gitignore`:

```
# OpenNext / Wrangler outputs (packages/web)
packages/web/.open-next/
packages/web/.wrangler/

# Build-time generated (packages/web)
packages/web/src/generated/version.ts
packages/web/src/generated/docs-index.json
```

- [ ] **Step 2.5: Type-check, lint, test**

```bash
pnpm -C packages/web type-check
pnpm -C packages/web lint
pnpm -C packages/web test
```

Expected: all three pass. Version route now has no fs/path imports.

- [ ] **Step 2.6: Commit**

```bash
git add packages/web/scripts/generate-version.ts \
        packages/web/src/app/api/version/route.ts \
        .gitignore
git commit -m "fix(web): embed AID version at build time instead of reading fs"
```

---

## Task 3: Swap `node:crypto` → `globalThis.crypto` in `/api/pka-demo`

**Files:**
- Modify: `packages/web/src/app/api/pka-demo/route.ts`

- [ ] **Step 3.1: Understand the Web Crypto API mapping**

The `webcrypto` export from `node:crypto` is Node's copy of the standard Web Crypto API. `globalThis.crypto` gives the identical surface area on every modern runtime (Node ≥20, Cloudflare Workers, browsers). The type is `Crypto`, and `crypto.subtle` is `SubtleCrypto` — no code paths change, only the import is removed and the cached-key type loses its `webcrypto.` namespace prefix.

- [ ] **Step 3.2: Apply the edit**

In `packages/web/src/app/api/pka-demo/route.ts`:

Remove line 2:
```typescript
import { webcrypto } from 'node:crypto';
```

Change line 14 from:
```typescript
let cachedKey: webcrypto.CryptoKey | null = null;
```
to:
```typescript
let cachedKey: CryptoKey | null = null;
```

Change lines 16–21 from:
```typescript
async function getPrivateKey(): Promise<webcrypto.CryptoKey> {
  if (cachedKey) return cachedKey;
  const der = Buffer.from(PRIVATE_KEY_B64, 'base64');
  cachedKey = (await webcrypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, [
    'sign',
  ]));
  return cachedKey;
}
```
to:
```typescript
async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const der = Buffer.from(PRIVATE_KEY_B64, 'base64');
  cachedKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  return cachedKey;
}
```

Change line 64 from:
```typescript
const sig = new Uint8Array(await webcrypto.subtle.sign('Ed25519', privateKey, base));
```
to:
```typescript
const sig = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', privateKey, base));
```

Leave `Buffer.from(...)` calls as-is — `Buffer` is available under `nodejs_compat` flag on CF Workers (we set it in Task 8's wrangler config) and works in Node.

- [ ] **Step 3.3: Type-check, lint, test**

```bash
pnpm -C packages/web type-check
pnpm -C packages/web lint
pnpm -C packages/web test
```

Expected: all three pass. No remaining `node:crypto` import in the file.

- [ ] **Step 3.4: Verify no other files import `node:crypto`**

```bash
grep -rn "node:crypto" packages/web/src || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3.5: Commit**

```bash
git add packages/web/src/app/api/pka-demo/route.ts
git commit -m "fix(web): use globalThis.crypto instead of node:crypto in pka-demo"
```

---

## Task 4: Pre-compile docs index (fixes `lib/docs/content.ts` + `navigation.ts` blockers)

**Files:**
- Create: `packages/web/scripts/generate-docs-index.ts`
- Create: `packages/web/src/generated/docs-index.json` (generated output)

- [ ] **Step 4.1: Understand the shape we need**

AID's existing runtime types are `DocPage` (from `content.ts`) with fields `{ slug, title, description, content, rawContent, headings }` and `Navigation` (from `navigation.ts`) with fields `{ rootPages, groups }`. The index must be able to answer:

1. `getDocBySlug(routeSlug: string): DocPage | null` — used by docs pages + `/api/docs/[...slug]`
2. `getAllDocSlugs(): string[]` — internal helper
3. `getAllDocRouteSlugs(): string[]` — used by sitemap + `generateStaticParams`
4. `getAllDocs(): DocPage[]` — used for bulk operations
5. `getNavigation(): Navigation` — used by docs layout

The simplest index shape that satisfies all of these:

```typescript
interface DocsIndex {
  // All markdown-file slugs (include "index", "quickstart/index", etc.)
  fileSlugs: string[];
  // DocPage map keyed by route slug (after toRouteSlug: "index" for root, no trailing "/index")
  docsByRouteSlug: Record<string, DocPage>;
  // Pre-built navigation tree
  navigation: Navigation;
}
```

Both `DocPage.content` (preprocessed) and `DocPage.rawContent` (original) must be included because `/api/docs/[...slug]` returns raw markdown while page rendering uses preprocessed content. Preprocessing via `preprocessMarkdown` runs at generate time — we import it into the script.

- [ ] **Step 4.2: Write `scripts/generate-docs-index.ts`**

Create `packages/web/scripts/generate-docs-index.ts`:

```typescript
/**
 * Pre-compiles the packages/docs markdown tree into a single JSON index
 * consumed at runtime by src/lib/docs/. At runtime on Cloudflare Workers,
 * the `fs` module is unavailable, so we bundle all content at build time.
 *
 * Output: packages/web/src/generated/docs-index.json
 *
 * Structure:
 *   {
 *     fileSlugs:       string[],              // all .md file slugs (including "index", "foo/index")
 *     docsByRouteSlug: Record<slug, DocPage>, // route slugs ("index" for root, no trailing /index)
 *     navigation: { rootPages, groups }       // pre-built sidebar tree
 *   }
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { preprocessMarkdown } from '../src/lib/docs/markdown';

interface Heading {
  depth: number;
  text: string;
  id: string;
}

interface DocPage {
  slug: string;
  title: string;
  description: string;
  content: string;
  rawContent: string;
  headings: Heading[];
}

interface NavItem {
  title: string;
  slug: string;
}

interface NavGroup {
  title: string;
  slug: string;
  items: NavItem[];
}

interface Navigation {
  rootPages: NavItem[];
  groups: NavGroup[];
}

interface DocsIndex {
  fileSlugs: string[];
  docsByRouteSlug: Record<string, DocPage>;
  navigation: Navigation;
}

interface RootMeta {
  pages: string[];
  groups: Array<{ slug: string; title: string }>;
}

interface GroupMeta {
  title: string;
  pages: string[];
}

// Script runs from packages/web, docs live at ../docs
const DOCS_DIR = path.resolve(__dirname, '..', '..', 'docs');
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'docs-index.json');

function toRouteSlug(slug: string): string {
  if (slug === 'index') return 'index'; // sentinel for root page
  if (slug.endsWith('/index')) return slug.slice(0, -'/index'.length);
  return slug;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .trim();
}

function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{2,6})\s+(.+)/);
    if (match) {
      const depth = match[1].length;
      const text = match[2]
        .replaceAll(/`([^`]*)`/g, '$1')
        .replaceAll(/\*\*([^*]*)\*\*/g, '$1')
        .replaceAll(/\*([^*]*)\*/g, '$1')
        .trim();
      headings.push({ depth, text, id: slugify(text) });
    }
  }
  return headings;
}

function pathToSlug(filePath: string): string {
  return filePath.replace(/\.md$/, '').split(path.sep).join('/');
}

function walkDir(dir: string, base: string = dir): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, base));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.relative(base, fullPath));
    }
  }
  return files;
}

function readDoc(fileSlug: string): DocPage | null {
  const filePath = path.join(DOCS_DIR, `${fileSlug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content: rawBody } = matter(raw);
  const routeSlug = toRouteSlug(fileSlug);

  const title =
    (data.title as string) || routeSlug.split('/').pop() || routeSlug || 'index';
  const description = (data.description as string) ?? '';
  const preprocessed = preprocessMarkdown(rawBody, fileSlug);
  const headings = extractHeadings(rawBody);

  return {
    slug: routeSlug,
    title,
    description,
    content: preprocessed,
    rawContent: rawBody,
    headings,
  };
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function buildNavigation(docsByRouteSlug: Record<string, DocPage>): Navigation {
  const rootMeta = readJson<RootMeta>(path.join(DOCS_DIR, 'meta.json'));
  if (!rootMeta) return { rootPages: [], groups: [] };

  function titleFor(routeSlug: string, fallback: string): string {
    return docsByRouteSlug[routeSlug]?.title ?? fallback;
  }

  const rootPages: NavItem[] = rootMeta.pages.map((pageSlug) => {
    // "index" in meta.json means root page. Route slug convention: "" (empty)
    // but internally we store root as "index" to match existing nav behavior.
    const isRoot = pageSlug === 'index';
    const routeSlug = isRoot ? 'index' : pageSlug;
    return {
      title: titleFor(routeSlug, isRoot ? 'Home' : pageSlug),
      slug: isRoot ? '' : pageSlug,
    };
  });

  const groups: NavGroup[] = rootMeta.groups.map((group) => {
    const groupMeta = readJson<GroupMeta>(path.join(DOCS_DIR, group.slug, 'meta.json'));
    const items: NavItem[] = (groupMeta?.pages ?? []).map((pageSlug) => {
      const isIndex = pageSlug === 'index';
      const fullRouteSlug = isIndex ? group.slug : `${group.slug}/${pageSlug}`;
      return {
        title: titleFor(fullRouteSlug, pageSlug),
        slug: fullRouteSlug,
      };
    });
    return {
      title: groupMeta?.title ?? group.title,
      slug: group.slug,
      items,
    };
  });

  return { rootPages, groups };
}

function main(): void {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`[generate-docs-index] FATAL: docs dir not found at ${DOCS_DIR}`);
    process.exit(1);
  }

  const fileSlugs = walkDir(DOCS_DIR).map((f) => pathToSlug(f));
  const docsByRouteSlug: Record<string, DocPage> = {};

  for (const fileSlug of fileSlugs) {
    const doc = readDoc(fileSlug);
    if (doc) docsByRouteSlug[doc.slug] = doc;
  }

  const navigation = buildNavigation(docsByRouteSlug);

  const index: DocsIndex = { fileSlugs, docsByRouteSlug, navigation };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(index));

  const docCount = Object.keys(docsByRouteSlug).length;
  const navCount = navigation.rootPages.length + navigation.groups.length;
  console.log(
    `[generate-docs-index] ${docCount} docs, ${navCount} nav entries → ${OUT_FILE}`,
  );
}

main();
```

- [ ] **Step 4.3: Run the generator and verify output**

```bash
pnpm -C packages/web exec tsx scripts/generate-docs-index.ts
ls -lh packages/web/src/generated/docs-index.json
node -e "const i = require('./packages/web/src/generated/docs-index.json'); console.log('docs:', Object.keys(i.docsByRouteSlug).length, 'root:', i.navigation.rootPages.length, 'groups:', i.navigation.groups.length, 'fileSlugs:', i.fileSlugs.length);"
```

Expected: JSON file exists, docs count > 10, navigation has `rootPages` and `groups` populated, `fileSlugs` includes entries like `"index"`, `"specification"`, `"quickstart/quickstart_ts"`, etc.

- [ ] **Step 4.4: Sanity-check a specific doc**

```bash
node -e "const i = require('./packages/web/src/generated/docs-index.json'); const d = i.docsByRouteSlug['specification']; console.log('title:', d?.title); console.log('headings:', d?.headings?.length); console.log('content preview:', d?.content?.slice(0,100));"
```

Expected: title non-empty, at least one heading, content starts with preprocessed markdown (no raw `!!! note` admonition syntax — should have been converted).

- [ ] **Step 4.5: Commit the generator script**

```bash
git add packages/web/scripts/generate-docs-index.ts
git commit -m "feat(web): pre-compile docs to JSON at build time for CF Workers"
```

(The generated `docs-index.json` is gitignored, so only the script is committed.)

---

## Task 5: Refactor `lib/docs/content.ts` to use the generated index

**Files:**
- Modify: `packages/web/src/lib/docs/content.ts`

- [ ] **Step 5.1: Understand the strategy**

We mirror the main site's dual-mode pattern:
1. **Primary path:** `require('../../generated/docs-index.json')` inside a try/catch. Webpack/Next.js statically analyzes the literal path and bundles the JSON. At runtime on CF Workers, this is a plain object lookup.
2. **Fallback path:** If require fails (the JSON hasn't been generated yet — e.g., fresh local dev before running the generator), fall back to reading from `packages/docs` via `fs`. The fallback is only used in Node.js dev; it silently returns empty on CF Workers because the `require` never throws there (the JSON IS bundled).

The runtime types (`DocPage`, `Heading`) stay exactly the same so existing consumers don't change.

- [ ] **Step 5.2: Rewrite `lib/docs/content.ts`**

Replace the entire contents of `packages/web/src/lib/docs/content.ts` with:

```typescript
/**
 * Documentation content loader.
 *
 * Primary: reads a pre-compiled JSON index generated by
 *   scripts/generate-docs-index.ts (required for Cloudflare Workers, where
 *   `fs` is unavailable at runtime).
 *
 * Fallback: if the pre-compiled index is missing (e.g., local dev before
 *   running the generator), reads markdown from packages/docs via fs. This
 *   path never executes on Cloudflare Workers because the generator always
 *   runs as part of `build:cf`.
 */

import { preprocessMarkdown } from './markdown';

export interface Heading {
  depth: number; // 2–6
  text: string;
  id: string;
}

export interface DocPage {
  slug: string; // "index" for root; e.g. "quickstart/quickstart_ts" otherwise
  title: string;
  description: string;
  content: string; // preprocessed markdown
  rawContent: string; // original raw markdown
  headings: Heading[];
}

interface DocsIndexShape {
  fileSlugs: string[];
  docsByRouteSlug: Record<string, DocPage>;
  navigation: {
    rootPages: Array<{ title: string; slug: string }>;
    groups: Array<{
      title: string;
      slug: string;
      items: Array<{ title: string; slug: string }>;
    }>;
  };
}

let _index: DocsIndexShape | null = null;

function getIndex(): DocsIndexShape | null {
  if (_index) return _index;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    _index = require('../../generated/docs-index.json') as DocsIndexShape;
    return _index;
  } catch {
    return null;
  }
}

// --- Internal type shared with navigation.ts via re-export ---
export function _getIndex(): DocsIndexShape | null {
  return getIndex();
}

// ---------- fs fallback (local dev only) ----------

function toRouteSlug(slug: string): string {
  if (slug === 'index') return 'index';
  if (slug.endsWith('/index')) return slug.slice(0, -'/index'.length);
  return slug;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .trim();
}

function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{2,6})\s+(.+)/);
    if (match) {
      const depth = match[1].length;
      const text = match[2]
        .replaceAll(/`([^`]*)`/g, '$1')
        .replaceAll(/\*\*([^*]*)\*\*/g, '$1')
        .replaceAll(/\*([^*]*)\*/g, '$1')
        .trim();
      headings.push({ depth, text, id: slugify(text) });
    }
  }
  return headings;
}

function getDocFromFs(slug: string): DocPage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const path = require('node:path') as typeof import('node:path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const matter = require('gray-matter') as typeof import('gray-matter');

    const docsDir = fs.existsSync(path.join(process.cwd(), 'packages', 'docs'))
      ? path.join(process.cwd(), 'packages', 'docs')
      : path.join(process.cwd(), '..', 'docs');

    const normalized = slug.replaceAll(/^\/+|\/+$/g, '');
    const candidates = normalized ? [normalized, `${normalized}/index`] : ['index'];

    let fileSlug: string | null = null;
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(docsDir, `${candidate}.md`))) {
        fileSlug = candidate;
        break;
      }
    }
    if (!fileSlug) return null;

    const routeSlug = toRouteSlug(fileSlug);
    const raw = fs.readFileSync(path.join(docsDir, `${fileSlug}.md`), 'utf8');
    const { data, content: rawBody } = matter(raw);

    const title = (data.title as string) || routeSlug.split('/').pop() || routeSlug || 'index';
    const description = (data.description as string) ?? '';
    return {
      slug: routeSlug === '' ? 'index' : routeSlug,
      title,
      description,
      content: preprocessMarkdown(rawBody, fileSlug),
      rawContent: rawBody,
      headings: extractHeadings(rawBody),
    };
  } catch {
    return null;
  }
}

function getAllDocSlugsFromFs(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const path = require('node:path') as typeof import('node:path');

    const docsDir = fs.existsSync(path.join(process.cwd(), 'packages', 'docs'))
      ? path.join(process.cwd(), 'packages', 'docs')
      : path.join(process.cwd(), '..', 'docs');

    if (!fs.existsSync(docsDir)) return [];

    const results: string[] = [];
    function walk(dir: string, base: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, base);
        else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(path.relative(base, full).replace(/\.md$/, '').split(path.sep).join('/'));
        }
      }
    }
    walk(docsDir, docsDir);
    return results;
  } catch {
    return [];
  }
}

// ---------- Public API ----------

/** Load a single doc by its route slug. Returns null if not found. */
export function getDocBySlug(slug: string): DocPage | null {
  const index = getIndex();
  if (index) {
    // The generated index keys are route slugs ("index", "specification", "quickstart/quickstart_ts").
    // Incoming slugs from [[...slug]] also use "index" sentinel for the root route.
    const normalized = slug === '' || slug === 'index' ? 'index' : slug.replace(/^\/+|\/+$/g, '');
    return index.docsByRouteSlug[normalized] ?? null;
  }
  return getDocFromFs(slug);
}

/** Get all file slugs (including "index" and "foo/index" variants). */
export function getAllDocSlugs(): string[] {
  const index = getIndex();
  if (index) return index.fileSlugs;
  return getAllDocSlugsFromFs();
}

/** Get all canonical route slugs (no trailing /index, "index" for root). */
export function getAllDocRouteSlugs(): string[] {
  const index = getIndex();
  if (index) return Object.keys(index.docsByRouteSlug);
  return [...new Set(getAllDocSlugsFromFs().map((s) => toRouteSlug(s)))];
}

/** Load all doc pages. */
export function getAllDocs(): DocPage[] {
  const index = getIndex();
  if (index) return Object.values(index.docsByRouteSlug);
  return getAllDocRouteSlugs()
    .map((s) => getDocBySlug(s))
    .filter((d): d is DocPage => d !== null);
}
```

- [ ] **Step 5.3: Verify `getAllDocRouteSlugs()` contract matches existing callers**

The sitemap code at `packages/web/src/app/sitemap.ts:8-13` filters `slug !== ''` out. The old fs implementation returned `''` for the root index. The new implementation returns `'index'`. Check both sitemap and docs page:

```bash
grep -n "getAllDocRouteSlugs\|slug !== ''\|slug === ''" packages/web/src/app/sitemap.ts packages/web/src/app/docs/\[\[...slug\]\]/page.tsx
```

Expected output shows the two filter sites. Decision: **we must keep the old contract** (empty string for root) so sitemap and `generateStaticParams` keep working. Fix `getAllDocRouteSlugs()` to translate `'index'` → `''`:

Replace the `getAllDocRouteSlugs` function body with:
```typescript
export function getAllDocRouteSlugs(): string[] {
  const index = getIndex();
  if (index) {
    return Object.keys(index.docsByRouteSlug).map((s) => (s === 'index' ? '' : s));
  }
  return [...new Set(getAllDocSlugsFromFs().map((s) => toRouteSlug(s)))].map((s) =>
    s === 'index' ? '' : s,
  );
}
```

Also update `getDocBySlug` to treat `''` as root consistently — the existing code path `slug === '' || slug === 'index' ? 'index' : ...` already does this, so no additional change needed there. But `getAllDocs()` should still iterate over route keys directly (they're `'index'` in the index; that's fine — we return the DocPage objects unchanged and consumers use `.slug` which we've set to `'index'` for the root). Actually — check: old code stored `slug: routeSlug === '' ? 'index' : routeSlug`, so existing doc pages store `slug: 'index'` for root. That matches. ✓

- [ ] **Step 5.4: Type-check, lint, test**

```bash
pnpm -C packages/web type-check
pnpm -C packages/web lint
pnpm -C packages/web test
```

Expected: all pass. If the ESLint config flags `@typescript-eslint/no-require-imports`, the `eslint-disable-next-line` comments already added silence them. If it flags different rules, add those to the disable line.

- [ ] **Step 5.5: Commit**

```bash
git add packages/web/src/lib/docs/content.ts
git commit -m "refactor(web): load docs from pre-compiled index with fs fallback"
```

---

## Task 6: Refactor `lib/docs/navigation.ts` to use the generated index

**Files:**
- Modify: `packages/web/src/lib/docs/navigation.ts`

- [ ] **Step 6.1: Rewrite `lib/docs/navigation.ts`**

Replace the entire contents of `packages/web/src/lib/docs/navigation.ts` with:

```typescript
/**
 * Navigation loader — reads the pre-built navigation tree from the
 * pre-compiled docs index. Navigation construction (reading meta.json
 * files and joining with doc titles) happens at build time in
 * scripts/generate-docs-index.ts.
 *
 * Falls back to an empty navigation if the index is missing — better than
 * importing fs into the Workers bundle. Local dev without the generator
 * will see an empty sidebar until `pnpm build` or `pnpm dev` runs the
 * generator.
 */

import { _getIndex } from './content';

export interface NavItem {
  title: string;
  slug: string;
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

export function getNavigation(): Navigation {
  const index = _getIndex();
  if (!index) return { rootPages: [], groups: [] };
  return index.navigation;
}
```

- [ ] **Step 6.2: Verify the public API in `lib/docs/index.ts` still lines up**

```bash
cat packages/web/src/lib/docs/index.ts
```

Expected exports: `getDocBySlug`, `getAllDocSlugs`, `getAllDocRouteSlugs`, `getAllDocs`, `DocPage`, `Heading`, `getNavigation`, `Navigation`, `NavGroup`, `NavItem`, `preprocessMarkdown`. All of these are still exported after the refactor. No changes needed to `index.ts`.

- [ ] **Step 6.3: Type-check, lint, test**

```bash
pnpm -C packages/web type-check
pnpm -C packages/web lint
pnpm -C packages/web test
```

Expected: all pass.

- [ ] **Step 6.4: Verify no fs imports remain in `lib/docs/`**

```bash
grep -rn "from 'fs'\|from 'node:fs'\|require('fs')\|require('node:fs')" packages/web/src/lib/docs/
```

Expected: only matches inside `content.ts` under the `getDocFromFs` / `getAllDocSlugsFromFs` fallback paths (inside try blocks, gated by `getIndex() === null`). No matches in `navigation.ts`, `index.ts`, or `markdown.ts`.

- [ ] **Step 6.5: Commit**

```bash
git add packages/web/src/lib/docs/navigation.ts
git commit -m "refactor(web): read navigation from pre-compiled docs index"
```

---

## Task 7: Wire the generators into build/dev scripts + update `next.config.js`

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/next.config.js`

- [ ] **Step 7.1: Update `packages/web/package.json` scripts**

Change the `scripts` block. Replace:

```json
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
```

with:

```json
    "gen:content": "tsx scripts/generate-version.ts && tsx scripts/generate-docs-index.ts",
    "dev": "pnpm gen:content && next dev --webpack",
    "build": "pnpm gen:content && next build --webpack",
    "start": "next start",
    "build:cf": "pnpm gen:content && opennextjs-cloudflare build",
    "deploy:cf": "opennextjs-cloudflare deploy",
    "preview:cf": "opennextjs-cloudflare preview",
```

Also add `tsx` to devDependencies if it isn't already listed. Check first:

```bash
grep -E '"tsx"' packages/web/package.json || pnpm -C packages/web add -D tsx
```

If `tsx` isn't present, the command installs it.

- [ ] **Step 7.2: Remove `output: 'standalone'` and add OpenNext dev hook in `next.config.js`**

`@opennextjs/cloudflare` is incompatible with `output: 'standalone'` (it runs its own bundler over the normal Next output). It also exposes `initOpenNextCloudflareForDev()` which makes `getCloudflareContext()` usable during `next dev` — required for local testing of CF-specific bindings.

Modify `packages/web/next.config.js`:

1. Add at the very top (line 1), before the JSDoc `@type` comment:

```javascript
const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare');

initOpenNextCloudflareForDev();
```

2. Remove this line from the config object:

```javascript
  output: 'standalone',
```

Everything else (redirects, headers, webpack hook, images) stays.

- [ ] **Step 7.3: Run the generators manually to verify wiring**

```bash
pnpm -C packages/web gen:content
ls -lh packages/web/src/generated/docs-index.json packages/web/src/generated/version.ts
```

Expected: both files present. Generators print success lines.

- [ ] **Step 7.4: Run type-check + lint + tests + full webpack build**

```bash
pnpm -C packages/web type-check
pnpm -C packages/web lint
pnpm -C packages/web test
pnpm -C packages/web build
```

Expected: all four pass. The webpack build is the critical check — it will reveal any remaining fs/path issues in the bundle because Next.js statically analyzes imports. Look for warnings/errors like "Module not found: fs" or "Critical dependency: the request of a dependency is an expression". There should be none.

If `next build` succeeds, all 4 original blockers are addressed.

- [ ] **Step 7.5: Commit**

```bash
git add packages/web/package.json packages/web/next.config.js
git commit -m "build(web): wire docs/version generators into build; remove standalone output"
```

---

## Task 8: Create `open-next.config.ts` and `wrangler.jsonc`

**Files:**
- Create: `packages/web/open-next.config.ts`
- Create: `packages/web/wrangler.jsonc`

- [ ] **Step 8.1: Confirm AID doesn't need ISR cache**

AID has no `revalidate` usage, no `unstable_cache`, no `revalidateTag` calls. Verify:

```bash
grep -rn "revalidate\|unstable_cache\|revalidateTag\|revalidatePath" packages/web/src --include="*.ts" --include="*.tsx" | grep -v "//\|/\*"
```

If the output is empty or only contains unrelated matches, we skip R2+D1 entirely and use the OpenNext default in-memory cache. (Main site uses R2+D1 because it has ISR for `/map`, `/m/[slug]`. AID does not.)

- [ ] **Step 8.2: Write `open-next.config.ts`**

Create `packages/web/open-next.config.ts`:

```typescript
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// AID has no ISR — no revalidate, no unstable_cache. We use the OpenNext
// defaults (in-memory incremental cache + memory tag cache + memory queue).
// No R2/D1/DO bindings required → $5/mo Workers paid plan covers everything.
export default defineCloudflareConfig({});
```

- [ ] **Step 8.3: Write `wrangler.jsonc`**

Create `packages/web/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "agentcommunity-aid",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
  // No R2/D1/DO bindings — AID has no ISR, no persistent cache needs.
  // account_id is pulled from the CLOUDFLARE_ACCOUNT_ID env var or `wrangler login`.
}
```

Note: we deliberately omit `account_id` from the file so this works for both CI and the user's local `wrangler login`. The user can add their account ID later if needed.

- [ ] **Step 8.4: Run the Cloudflare build**

```bash
pnpm -C packages/web build:cf 2>&1 | tail -60
```

Expected: `opennextjs-cloudflare build` succeeds. It first runs `pnpm gen:content && next build --webpack`, then packages the output into `.open-next/worker.js` and `.open-next/assets/`. Look at the tail output for:
- "OpenNext build complete" (or similar success marker)
- No errors about unresolved Node modules
- Bundle size (should be well under the 10MB Workers limit — AID is small)

If there are "nodejs_compat" warnings about specific Node APIs being used in ways that aren't supported, address them case-by-case (most are non-fatal).

- [ ] **Step 8.5: Commit**

```bash
git add packages/web/open-next.config.ts packages/web/wrangler.jsonc
git commit -m "build(web): add open-next.config and wrangler.jsonc for CF Workers"
```

---

## Task 9: Deploy to `*.workers.dev` and smoke-test

**Files:** none (deployment only)

- [ ] **Step 9.1: Ensure wrangler auth**

```bash
pnpm -C packages/web exec wrangler whoami
```

Expected: prints an email. If not, run `pnpm -C packages/web exec wrangler login` (opens browser for OAuth). Do NOT run `wrangler login` automatically — it requires user interaction. Ask the user to run it if not authenticated.

- [ ] **Step 9.2: Verify $5/mo Workers Paid plan is active**

AID's bundle should be small enough to fit in the 3MB free tier, but the main site migration already requires Paid for its 10MB bundle and AID will share the same account. Confirm via:

```bash
pnpm -C packages/web exec wrangler deployments list 2>&1 | head
```

Or check the dashboard at `https://dash.cloudflare.com/?to=/:account/workers/plans`. If Paid isn't active, ask the user to upgrade before deploying.

- [ ] **Step 9.3: Deploy**

```bash
pnpm -C packages/web deploy:cf 2>&1 | tail -30
```

Expected: Wrangler uploads the worker and prints the deployment URL (e.g. `https://agentcommunity-aid.<account>.workers.dev`). Capture that URL for the next step.

- [ ] **Step 9.4: Smoke-test static + SSR + API routes**

Replace `<URL>` with the workers.dev URL from step 9.3:

```bash
URL="https://agentcommunity-aid.<account>.workers.dev"

# Landing page (SSR)
curl -sS -o /dev/null -w "root: %{http_code}\n" "$URL/"

# Workbench (client page)
curl -sS -o /dev/null -w "workbench: %{http_code}\n" "$URL/workbench"

# Docs index (uses getNavigation + getDocBySlug)
curl -sS -o /dev/null -w "docs: %{http_code}\n" "$URL/docs"

# A nested docs page (uses pre-compiled index)
curl -sS -o /dev/null -w "docs/specification: %{http_code}\n" "$URL/docs/specification"
curl -sS -o /dev/null -w "docs/quickstart/quickstart_ts: %{http_code}\n" "$URL/docs/quickstart/quickstart_ts"

# Version API (tests generated version import)
curl -sS "$URL/api/version"

# Docs raw markdown API
curl -sS -o /dev/null -w "api/docs: %{http_code}\n" "$URL/api/docs/specification"

# OG image (edge runtime)
curl -sS -o /dev/null -w "og: %{http_code}\n" "$URL/api/og/docs?title=Test&slug=specification"

# Sitemap (uses getAllDocRouteSlugs)
curl -sS -o /dev/null -w "sitemap: %{http_code}\n" "$URL/sitemap.xml"

# PKA demo — should return JSON description (no AID-Challenge header)
curl -sS "$URL/api/pka-demo"

# PKA demo — full handshake with challenge header (tests globalThis.crypto.subtle.sign)
curl -sS -D - -o /dev/null \
  -H "AID-Challenge: test-nonce-$(date +%s)" \
  "$URL/api/pka-demo"
```

Expected results:
- All status codes should be 200 (or expected redirects — some docs routes use redirects from `next.config.js`)
- `/api/version` returns `{"version":"<aid-version>"}` matching `packages/aid/package.json`
- `/api/pka-demo` without challenge returns the JSON description
- `/api/pka-demo` with challenge header returns 200 with `Signature:`, `Signature-Input:`, and `Date:` response headers present
- `/sitemap.xml` contains doc URLs like `/docs/specification`
- `/docs/specification` renders the HTML page (check for `<h1>` and `<title>`)

- [ ] **Step 9.5: Test the handshake API**

```bash
curl -sS -X POST "$URL/api/handshake" \
  -H "Content-Type: application/json" \
  -d '{"uri":"https://simple.agentcommunity.org","proto":"mcp"}'
```

Expected: JSON response with `success` or `needsAuth` field. This tests the full AID discovery path (DNS + well-known fallback + protocol handler) on the Workers runtime.

- [ ] **Step 9.6: Test the generator/validator API**

```bash
curl -sS -X POST "$URL/api/generator/validate" \
  -H "Content-Type: application/json" \
  -d '{"v":"aid1","u":"https://example.com","p":"mcp"}'
```

Expected: JSON response with `success`, `txt`, `json`, `bytes`, `errors`, `warnings` fields.

- [ ] **Step 9.7: If any smoke test fails, diagnose and fix**

Common failure modes:
- **500 on docs page:** the pre-compiled index isn't in the bundle. Check `.open-next/worker.js` for the string `docsByRouteSlug` (e.g. `grep -c docsByRouteSlug packages/web/.open-next/worker.js`). If 0, the generator didn't run before `opennextjs-cloudflare build`, or the require path in `content.ts` is wrong.
- **500 on `/api/pka-demo` with challenge:** `globalThis.crypto.subtle.sign` failed. Check the error via `wrangler tail` during a repeat request.
- **Wrong version in `/api/version`:** stale `src/generated/version.ts`. Re-run `pnpm -C packages/web gen:content` and redeploy.
- **Sitemap missing docs:** `getAllDocRouteSlugs()` returned wrong shape. Re-check the `'index' → ''` mapping in Task 5 Step 5.3.

For each issue: reproduce locally via `pnpm -C packages/web preview:cf` (runs the built worker against a local wrangler dev server), fix in source, rerun `pnpm -C packages/web build:cf && pnpm -C packages/web deploy:cf`, re-test.

- [ ] **Step 9.8: Use `wrangler tail` to watch live logs during smoke tests**

In a separate terminal:

```bash
pnpm -C packages/web exec wrangler tail agentcommunity-aid
```

Then re-hit the endpoints. Any runtime errors or warnings (e.g. "fs.readFileSync is not a function") will appear here. No errors expected.

---

## Task 10: Final verification + handoff

**Files:** none

- [ ] **Step 10.1: Confirm clean working tree for phases that matter**

```bash
cd /Users/user/dev/PROJECTS/AgentCommunity/AID
git status
```

Expected: only the files listed in the "Modified files" / "New files" sections above are present. No stray edits.

- [ ] **Step 10.2: Run the full verification gate one more time**

```bash
pnpm -C packages/web lint
pnpm -C packages/web type-check
pnpm -C packages/web test
pnpm -C packages/web build       # local webpack build
pnpm -C packages/web build:cf    # OpenNext build
```

All five must pass. This is the single go/no-go gate before handing off to DNS cutover.

- [ ] **Step 10.3: Document the deployed URL + any notes**

Append a short entry to `tracking/plans/2026-04-06-cloudflare-workers-migration.md` under a new `## Deployment Log` section:

```markdown
## Deployment Log

- YYYY-MM-DD HH:MM — deployed to `https://agentcommunity-aid.<account>.workers.dev`
- Bundle size: <X MB>
- Smoke tests passed: root, workbench, docs, docs/specification, api/version, api/pka-demo (both modes), api/handshake, api/generator/validate, api/og, sitemap
- Outstanding: DNS cutover (Phase 3 of main migration plan — Terraform provider swap pending)
```

- [ ] **Step 10.4: Leave DNS cutover explicitly pending**

Do NOT touch DNS, do NOT update `showcase/terraform/main.tf` (that's Phase 3 of the main migration plan, not 6b). The plan ends here with a working workers.dev deployment that can be cut over on migration day.

- [ ] **Step 10.5: Final commit**

```bash
git add tracking/plans/2026-04-06-cloudflare-workers-migration.md
git commit -m "docs(web): record CF Workers deployment log for AID Phase 6b"
```

---

## Self-Review

**Spec coverage (Phase 6b blockers from CLOUDFLARE-MIGRATION-PLAN.md lines 757-767):**

| Phase 6b item | Task |
|---|---|
| Add `@opennextjs/cloudflare` + `wrangler` | Task 1.2 |
| Fix `fs` in `lib/docs/content.ts` via JSON pre-compile | Tasks 4 + 5 |
| Fix `node:crypto` in `/api/pka-demo` → `globalThis.crypto` | Task 3 |
| Fix `fs.readFile` in `/api/version` → build-time embed | Task 2 |
| Create `open-next.config.ts` + `wrangler.jsonc` | Task 8 |
| Deploy via `build:cf && deploy:cf` | Tasks 7.1, 9.3 |
| Test workbench, PKA handshake, docs, all API routes | Steps 9.4, 9.5, 9.6 |
| DNS update | **Out of scope** (explicitly deferred in Task 10.4) |
| Run AID Terraform (already on CF provider from Phase 3) | **Out of scope** |

**Additional blockers from the CLOUDFLARE-MIGRATION-PLAN.md table at lines 374-379:**

| Item | Task |
|---|---|
| `fs.readFileSync` / `fs.readdirSync` in `lib/docs/content.ts` | Tasks 4 + 5 |
| `node:crypto` webcrypto in `/api/pka-demo` | Task 3 |
| `fs.readFile` in `/api/version` | Task 2 |
| `process.cwd()` for monorepo path resolution | Tasks 2 (version) + 4 (docs) — both scripts use `path.resolve(__dirname, '..', ...)` which is build-time-stable, not runtime-dependent |

All Phase 6b blockers covered. `process.cwd()` is eliminated at runtime everywhere — the only remaining usages are inside the fs-fallback branch of `content.ts` (never executes on CF Workers) and inside build-time scripts (run on the build host, not the Worker).

**Also covered (not explicit blockers but required):**
- `output: 'standalone'` removal in `next.config.js` (incompatible with OpenNext) — Task 7.2
- `initOpenNextCloudflareForDev()` hook for local dev — Task 7.2
- `.gitignore` updates — Task 2.4
- Build script wiring — Task 7.1
- `lib/docs/navigation.ts` also uses fs (not called out in Phase 6b but required) — Task 6

**Placeholder scan:** no TBDs, no "add appropriate error handling" phrases, no "similar to Task N" without showing the code. Every step has the exact file path, exact commands, and full code blocks where code is written.

**Type consistency:**
- `DocPage` type: `{ slug, title, description, content, rawContent, headings }` — defined identically in Task 4 (generate script), Task 5 (content.ts), and matches existing signature.
- `Navigation` type: `{ rootPages, groups }` with `NavItem { title, slug }` and `NavGroup { title, slug, items }` — identical in Task 4 (generator) and Task 6 (navigation.ts).
- `DocsIndexShape` in `content.ts` (Task 5) matches `DocsIndex` in `generate-docs-index.ts` (Task 4): same `fileSlugs`, `docsByRouteSlug`, `navigation`.
- `_getIndex` is exported from `content.ts` (Task 5.2) and consumed by `navigation.ts` (Task 6.1) — both files agree on the shape.
- `getAllDocRouteSlugs` returns `string[]` where root is `''` (not `'index'`) — Task 5.3 fixes the contract, sitemap + `generateStaticParams` continue to work unchanged.
- `getDocBySlug('' | 'index')` both resolve to the root doc — verified in Task 5.2.

**Scope check:** this is one subsystem (one Next.js app, one deployment target). No need to split into sub-plans.

Fix applied during self-review: `getAllDocRouteSlugs` contract fix in Task 5.3 — caught that the old fs code returned `''` for root but the new index keys use `'index'`, which would have broken the sitemap and `generateStaticParams`.
