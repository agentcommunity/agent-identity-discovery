/**
 * Navigation structure builder for the docs sidebar.
 *
 * Reads meta.json ordering files from the docs directory to produce a
 * structured navigation tree with root pages and collapsible groups.
 */

import fs from 'fs';
import path from 'path';
import { getDocBySlug } from './content';

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

// Resolve docs directory (same logic as content.ts)
const DOCS_DIR = fs.existsSync(path.join(process.cwd(), 'packages', 'docs'))
  ? path.join(process.cwd(), 'packages', 'docs')
  : path.join(process.cwd(), '..', 'docs');

interface RootMeta {
  pages: string[];
  groups: { slug: string; title: string }[];
}

interface GroupMeta {
  title: string;
  pages: string[];
}

function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getTitleForSlug(slug: string): string {
  const doc = getDocBySlug(slug);
  return doc?.title ?? slug.split('/').pop() ?? slug;
}

export function getNavigation(): Navigation {
  const rootMeta = readJson<RootMeta>(path.join(DOCS_DIR, 'meta.json'));

  if (!rootMeta) {
    return { rootPages: [], groups: [] };
  }

  // Build root-level pages
  const rootPages: NavItem[] = rootMeta.pages.map((pageSlug) => ({
    title: getTitleForSlug(pageSlug === 'index' ? 'index' : pageSlug),
    slug: pageSlug === 'index' ? '' : pageSlug,
  }));

  // Build groups from subdirectories
  const groups: NavGroup[] = rootMeta.groups.map((group) => {
    const groupMeta = readJson<GroupMeta>(path.join(DOCS_DIR, group.slug, 'meta.json'));

    const items: NavItem[] = (groupMeta?.pages ?? []).map((pageSlug) => {
      const fullSlug = `${group.slug}/${pageSlug}`;
      return {
        title: getTitleForSlug(fullSlug),
        // index pages use the group slug as their route
        slug: pageSlug === 'index' ? group.slug : fullSlug,
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
