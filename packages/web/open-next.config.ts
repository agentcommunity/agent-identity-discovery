import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// AID has no ISR — no revalidate, no unstable_cache, no on-demand revalidation.
// Every page is either fully SSG (docs, landing, workbench) or a dynamic route
// handler (api/version, api/og/docs, api/pka-demo, etc.).
//
// staticAssetsIncrementalCache copies SSG'd HTML into
// .open-next/assets/cdn-cgi/_next_cache/ at deploy time (via the populateCache
// step that deploy:cf auto-runs) and reads it from the ASSETS binding at
// request time, so the Worker never re-renders pages that were already
// prerendered on Node. This is critical because re-rendering MDX docs at
// request time hits libraries that use `eval()` (disallowed on the Workers
// runtime).
//
// tagCache: 'dummy' — with no revalidateTag() / unstable_cache calls anywhere
// in AID, the default in-memory tag cache is dead code (per-isolate, useless
// for invalidation) and emits dev-mode warnings. The dummy adapter is a no-op
// that documents intent. (`dangerous.disableTagCache` lives on the underlying
// AWS config, not on CloudflareOverrides — `tagCache: 'dummy'` is the
// type-safe equivalent at this API level.)
//
// No R2/D1/DO bindings required → $5/mo Workers paid plan covers everything.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  tagCache: 'dummy',
});
