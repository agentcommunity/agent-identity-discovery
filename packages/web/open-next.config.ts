import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// AID has no ISR — no revalidate, no unstable_cache, no on-demand revalidation.
// Every page is either fully SSG (docs, landing, workbench) or a dynamic route
// handler (api/version, api/og/docs, api/pka-demo, etc.).
//
// staticAssetsIncrementalCache copies SSG'd HTML into .open-next/assets at
// build time and reads it from the ASSETS binding at request time, so the
// Worker never re-renders pages that were already prerendered on Node. This is
// critical because re-rendering MDX docs at request time hits libraries that
// use `eval()` (disallowed on the Workers runtime).
//
// No R2/D1/DO bindings required → $5/mo Workers paid plan covers everything.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
