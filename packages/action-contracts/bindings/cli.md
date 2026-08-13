# CLI binding contract (contract-only)

Status: **contract-only**. No product CLI exists in the repo today; this
defines the binding a future `jovie` CLI must implement.

## Mapping

- One subcommand per action: `jovie chat start`, `jovie contacts create`,
  `jovie releases create`, `jovie tasks create`.
- Flags map 1:1 to the generated input schema
  (`--title`, `--release-type`, …). `--input <file>` accepts a JSON document
  validated against the schema before any network call.
- `--idempotency-key` is accepted explicitly; when omitted the CLI generates
  a UUIDv4 and prints it to stderr so scripts can capture and reuse it.
- Output is the canonical envelope as JSON on stdout (`--json`, default for
  pipes) or a human rendering on a TTY. Exit codes: `0` for `ok: true`,
  `1` for `ok: false`, `2` for transport/usage errors. Scripts branch on
  `error.code`, never on message text.
- Auth: owner-workspace token (device flow or env var, designed in the
  dispatcher phase). The CLI holds no entitlement logic; `ENTITLEMENT_DENIED`
  is rendered, not predicted.
