# turbo-cache

Turborepo Remote Cache (API v8) as a Cloudflare Worker backed by R2, paid from
Cloudflare startup credits (Workers and R2 are covered). Live at
`jovie-turbo-cache.<account>.workers.dev`, which is the `CF_TURBO_CACHE_URL` secret.

## Who may write

| Caller | Token | Mode |
|---|---|---|
| `push` to main, `workflow_dispatch`, `merge_group` | `CF_TURBO_CACHE_RW_TOKEN` | read + write |
| `pull_request` (Source Validation, CI) | `CF_TURBO_CACHE_RO_TOKEN` | read only |
| Local agents and Gem (`scripts/turbo-local.mjs`) | `CF_TURBO_CACHE_RO_TOKEN` | read only |
| Fork PRs | none (GitHub withholds secrets) | local only |

The Worker enforces the roles. A PUT with the RO token returns 403, whatever
`TURBO_CACHE` the client asks for, so PR code that reads the token still cannot
write. Every artifact is HMAC-signed with `CF_TURBO_SIGNATURE_KEY`, and turbo
rejects unsigned or wrongly signed artifacts.

Residual risk: merge-group code is PR-authored code that already passed source
CI, and it holds the RW token. A malicious PR that reached the queue could write
a poisoned artifact. The controls are the Fork PR Gate (no fork code in the
queue), required source checks, and the 14-day R2 lifecycle. Removing merge-group
writes would also remove the main benefit, which is cache hits on queue
rebuilds and infra retries.

## Why our own Worker and not an upstream server

The upstream options were checked on 2026-10-29:

- [AdiRishi/turborepo-remote-cache-cloudflare](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare):
  Workers + R2, MIT, active. It has one `TURBO_TOKEN` and no read-only role, so
  any token that can read can also write. Meeting "PRs never write" would need a
  second gateway Worker in front of it. v5.0.0 (2026-10-27) is a fresh Nitro
  rewrite, too new to pin. The last stable tag is v4.0.0, commit `89a270b`
  (2026-01-19).
- [ducktors/turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache):
  Node, MIT, has an S3/R2 backend. It needs a host and an R2 S3 API key, and it
  has one token too.

`src/index.ts` is ~200 lines with no dependencies. It does role auth with
constant-time comparison, validates the hash, caps request size, and records
metrics. That is a smaller surface than upstream plus a gateway.
**Re-evaluate when:** upstream ships scoped (read-only) tokens.
**Then:** move to its pinned release and delete this Worker.

## Limits

- **Request body.** Cloudflare caps a Worker request body at 100 MB on Free/Pro
  zones. The `@jovie/web` build artifact is about 260 MB (local
  `.turbo/cache` sample), so the web build cannot be stored here. The merge-group
  combined build stays `local:r`. Typecheck, lint and unit-test artifacts are
  small and do fit. Uploading the web build would need direct R2 S3 multipart
  uploads, which needs an R2 API token (a new credential).
- **Artifact cap.** `MAX_ARTIFACT_BYTES` defaults to 512 MiB. The edge limit
  above applies first.
- **Expiry.** The R2 lifecycle deletes objects after 14 days.

## Measurement

- The CI timing collector (`scripts/lib/ci-timing-collector.mjs`) writes
  `turbo_cache` rows on a 1-in-4 run sample. Each row records backend, role,
  `tasks_cached` and `tasks_total` per turbo job.
- For ad hoc numbers: `node scripts/turbo-cache-hit-rate.mjs <runId>...`.
- The Worker writes hit/miss/put counts to Analytics Engine dataset
  `jovie_turbo_cache`.

## Test and deploy

Test: `node --experimental-strip-types --test infra/turbo-cache/src/index.test.mjs`

Deploy only from merged `main`: `cd infra/turbo-cache && wrangler deploy`. No
workflow deploys this yet. A CI deploy job needs a Cloudflare API token scoped to
Workers Scripts:Edit and Workers R2 Storage:Edit on this account, and that token
is not provisioned.
