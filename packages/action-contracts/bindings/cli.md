# CLI binding contract (contract-only)

Status: **contract-only**. No product CLI exists in the repo today; this
defines the binding a future `jovie` CLI must implement.

## Mapping

- One subcommand per action: `jovie chat start`, `jovie contacts create`,
  `jovie releases create`, `jovie tasks create`. Commands and `--help` output
  are generated from the manifest, not hand-written.
- Flags map 1:1 to the generated input schema
  (`--title`, `--release-type`, …). `--input <file>` accepts a JSON document
  validated against the schema before any network call.
- Context ownership: `--profile`, `--client-version`, and
  `--idempotency-key` populate the invocation envelope
  (`context.profileId`, `context.clientVersion`, top-level
  `idempotencyKey`), never the domain input. When `--idempotency-key` is
  omitted the CLI generates a UUIDv4 and prints it to stderr so scripts can
  capture and reuse it.
- Output is the canonical six-status `ActionResult` as JSON on stdout
  (`--json`, default for pipes) or a human rendering on a TTY:
  - `completed` prints the entity reference and data;
  - `handoff` prints the semantic target — for `jovie chat start` that is
    `chat.new` (a navigation handoff: no empty conversation is created or
    persisted, no message quota consumed), which the CLI renders as the
    canonical chat URL to open;
  - `requires_input` lists `missingFields`;
  - `in_progress` prints `retryAfterMs` guidance;
  - `unavailable` / `failed` render the structured error.
- Documented exit codes: `0` for `completed`/`handoff`, `1` for
  `failed`/`requires_input`, `2` for `unavailable`, `3` for transport/usage
  errors. Scripts branch on `error.code` from the stable vocabulary, never on
  message text.
- Auth: owner-workspace token (device flow or env var, designed in the
  dispatcher phase). The CLI holds no entitlement logic; `ENTITLEMENT_REQUIRED`
  and `QUOTA_EXHAUSTED` are rendered (with `upgrade` metadata when present),
  not predicted.
