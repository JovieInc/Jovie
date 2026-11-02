---
paths: ["apps/web/**"]
---

# Domain writes: one function per write

The same entity written through two paths drifts. The release form saved status,
reveal date, genres and the explicit flag; the chat tool called `upsertRelease`
with another slug rule and none of them (2026-10-26). Profile edits through chat
covered name and bio, the settings form more. Do not add a second path.

## Rules

- A write to a core table (`coreTables` in `apps/web/lib/domain/write-registry.json`)
  goes through a registered domain function: form server action, API route, chat
  or MCP tool, webhook, cron and import all call the same one. It owns validation,
  normalization (slug, URL, case), defaults, side effects (cache invalidation,
  events, analytics) and authorization.
- A new domain function is a new `domains` entry in the registry (module, exports,
  tables). Registered modules are the only place the guard lets direct writes live.
- Every chat tool and MCP tool has an `agentTools` entry: `domain` (names the
  registered function), `read`, `generate` (no persisted write) or `debt` (commit
  path still bypasses a domain function; needs a reason; the ceiling only drops).
- A save through the form and through the agent must produce identical stored
  state: write one test that calls both and compares rows.

## Enforced

- `node scripts/domain-write-guard.mjs` fails CI on a new direct `insert/update/delete`
  of a core table outside a registered module, and on a social-link writer with no
  cache invalidation. Existing sites are grandfathered in
  `scripts/lib/domain-write-guard.ratchet.gen.json`, which only shrinks; a PR may
  not raise it against the base. After moving a write into a domain function run
  `node scripts/domain-write-guard.mjs --write`.
- `apps/web/lib/domain/write-registry.test.ts` fails when a chat or MCP tool is
  missing from the registry, points at an unknown domain, or debt grows.
- Migrations, `lib/testing/`, dev-auth seeds and tests are exempt by path.
- Add a side effect every writer of a table must call to `sideEffects`; waive a
  file with a reason in `sideEffectWaivers`.
