/**
 * Docs engine — self-contained module for loading, preprocessing,
 * and navigating markdown documentation from the filesystem.
 *
 * Designed to be portable across Next.js projects.
 */

export { getDocBySlug, getAllDocSlugs, getAllDocRouteSlugs, getAllDocs } from './content';
export type { DocPage, Heading } from './content';

export { getNavigation } from './navigation';
export type { Navigation, NavGroup, NavItem } from './navigation';

export { preprocessMarkdown } from './markdown';
