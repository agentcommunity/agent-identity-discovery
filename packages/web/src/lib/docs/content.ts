/**
 * Filesystem-based content loader for documentation pages.
 *
 * Reads markdown files from packages/docs, parses frontmatter with gray-matter,
 * extracts headings for the table of contents, and applies MkDocs preprocessing.
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { preprocessMarkdown } from './markdown';

// Resolve docs directory — works both when cwd is monorepo root and packages/web
const DOCS_DIR = fs.existsSync(path.join(process.cwd(), 'packages', 'docs'))
  ? path.join(process.cwd(), 'packages', 'docs')
  : path.join(process.cwd(), '..', 'docs');

export interface Heading {
  depth: number; // 2–6 (h1 is the page title, skip it for TOC)
  text: string;
  id: string; // slugified anchor
}

export interface DocPage {
  slug: string; // e.g. "quickstart/quickstart_ts"
  title: string;
  description: string;
  content: string; // preprocessed markdown
  rawContent: string; // original raw markdown (for API)
  headings: Heading[];
}

/** Convert a file slug to its canonical docs route slug. */
function toRouteSlug(slug: string): string {
  if (slug === 'index') return '';
  if (slug.endsWith('/index')) return slug.slice(0, -'/index'.length);
  return slug;
}

/** Resolve an incoming route slug to an existing markdown file slug. */
function resolveFileSlug(slug: string): string | null {
  const normalized = slug.replaceAll(/^\/+|\/+$/g, '');
  const candidates = normalized ? [normalized, `${normalized}/index`] : ['index'];

  for (const candidate of candidates) {
    const filePath = path.join(DOCS_DIR, `${candidate}.md`);
    if (fs.existsSync(filePath)) return candidate;
  }

  return null;
}

/** Slugify a heading string into a URL-safe anchor id. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .trim();
}

/** Extract h2–h6 headings from markdown content for the table of contents. */
function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match ## through ###### at start of line (skip # h1)
    const match = line.match(/^(#{2,6})\s+(.+)/);
    if (match) {
      const depth = match[1].length;
      // Strip inline code backticks and markdown formatting for the text
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

/** Convert a file path relative to DOCS_DIR into a slug. */
function pathToSlug(filePath: string): string {
  return filePath.replace(/\.md$/, '').split(path.sep).join('/');
}

/** Recursively collect all .md file paths relative to a base directory. */
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

/** Get all doc page slugs. */
export function getAllDocSlugs(): string[] {
  return walkDir(DOCS_DIR).map((f) => pathToSlug(f));
}

/** Get all canonical route slugs (without trailing `/index`). */
export function getAllDocRouteSlugs(): string[] {
  return [...new Set(getAllDocSlugs().map((slug) => toRouteSlug(slug)))];
}

/** Load and parse a single doc by its slug. Returns null if not found. */
export function getDocBySlug(slug: string): DocPage | null {
  const fileSlug = resolveFileSlug(slug);
  if (!fileSlug) return null;
  const routeSlug = toRouteSlug(fileSlug);
  const filePath = path.join(DOCS_DIR, `${fileSlug}.md`);

  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content: rawBody } = matter(raw);

  const title = (data.title as string) || routeSlug.split('/').pop() || routeSlug || 'index';
  const description = (data.description as string) || '';

  const preprocessed = preprocessMarkdown(rawBody, fileSlug);
  const headings = extractHeadings(rawBody);

  return {
    slug: routeSlug === '' ? 'index' : routeSlug,
    title,
    description,
    content: preprocessed,
    rawContent: rawBody,
    headings,
  };
}

/** Load all doc pages. Used for sitemap generation and llms.txt. */
export function getAllDocs(): DocPage[] {
  return getAllDocRouteSlugs()
    .map((s) => getDocBySlug(s))
    .filter((doc): doc is DocPage => doc !== null);
}
