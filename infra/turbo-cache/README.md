# turbo-cache

Turborepo Remote Cache (API v8) as a Cloudflare Worker backed by R2. Replaces the
Vercel-hosted remote cache for CI; the Vercel cache stays as an automatic fallback
(see `.github/actions/setup-node-pnpm`, step "Select Turbo remote cache").

- Own ~200 lines, no dependencies, no third-party license surface.
- Two Worker secrets: `TURBO_CACHE_RW_TOKEN` (main pushes, workflow_dispatch) and
  `TURBO_CACHE_RO_TOKEN` (pull_request, merge_group). The RO token cannot write.
- Hit/miss/put counts go to Analytics Engine dataset `jovie_turbo_cache`
  (blobs: op, role, result; doubles: bytes).
- R2 lifecycle expires artifacts after 14 days.

Test: `node --experimental-strip-types --test infra/turbo-cache/src/index.test.mjs`
Deploy: `cd infra/turbo-cache && wrangler deploy`
