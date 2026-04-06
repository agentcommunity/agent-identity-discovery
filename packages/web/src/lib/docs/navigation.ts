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
