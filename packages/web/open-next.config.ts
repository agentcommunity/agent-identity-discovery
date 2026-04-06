import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// AID has no ISR — no revalidate, no unstable_cache. We use the OpenNext
// defaults (in-memory incremental cache + memory tag cache + memory queue).
// No R2/D1/DO bindings required → $5/mo Workers paid plan covers everything.
export default defineCloudflareConfig({});
