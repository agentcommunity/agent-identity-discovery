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
  headings: Array<Heading>;
}

interface NavItem {
  title: string;
  slug: string;
}

interface NavGroup {
  title: string;
  slug: string;
  items: Array<NavItem>;
}

interface Navigation {
  rootPages: Array<NavItem>;
  groups: Array<NavGroup>;
}

interface DocsIndex {
  fileSlugs: Array<string>;
  docsByRouteSlug: Record<string, DocPage>;
  navigation: Navigation;
}

interface RootMeta {
  pages: Array<string>;
  groups: Array<{ slug: string; title: string }>;
}

interface GroupMeta {
  title: string;
  pages: Array<string>;
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

function extractHeadings(content: string): Array<Heading> {
  const headings: Array<Heading> = [];
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

function walkDir(dir: string, base: string = dir): Array<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: Array<string> = [];
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

  const title = (data.title as string) || routeSlug.split('/').pop() || routeSlug || 'index';
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

  const rootPages: Array<NavItem> = rootMeta.pages.map((pageSlug) => {
    // "index" in meta.json means root page. Route slug convention: "" (empty)
    // but internally we store root as "index" to match existing nav behavior.
    const isRoot = pageSlug === 'index';
    const routeSlug = isRoot ? 'index' : pageSlug;
    return {
      title: titleFor(routeSlug, isRoot ? 'Home' : pageSlug),
      slug: isRoot ? '' : pageSlug,
    };
  });

  const groups: Array<NavGroup> = rootMeta.groups.map((group) => {
    const groupMeta = readJson<GroupMeta>(path.join(DOCS_DIR, group.slug, 'meta.json'));
    const items: Array<NavItem> = (groupMeta?.pages ?? []).map((pageSlug) => {
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
  console.log(`[generate-docs-index] ${docCount} docs, ${navCount} nav entries → ${OUT_FILE}`);
}

main();
