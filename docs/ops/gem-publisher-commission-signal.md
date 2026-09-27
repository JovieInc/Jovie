# Gem publisher commission signal

> Symphony is the shipping lanes harness (`scripts/lanes/README.md`). The Symphony Elixir control plane is retired from Jovie; paths written `symphony-control/...` live in the private repo JovieInc/symphony-control (full history).

`symphony-control/signals/gem-publisher-commission.request` starts
`symphony-control/.github/workflows/gem-publisher-commission.yml` (retired from Jovie) when it lands on `main`.

## Why

`workflow_dispatch` needs `actions:write`. The Cursor GitHub App does not have
it (HTTP 403). jovie-bot can still merge a PR that updates this signal file;
the `push` path then runs commission on `jovie-fixed` without a manual dispatch.

The signal path is under `symphony-control/` so Path Changes can admit it using
main's trusted product-lane classifier (no chicken-and-egg `ops/` mapping).

## Confirm gate

The JSON file must include:

```json
{ "confirm": "install-jov-6163-publisher" }
```

Any other value fail-closes. On push, `tip_sha` is the merge commit
(`github.sha`), not a value from the file, so tip-drift checks stay honest.

## Manual dispatch (Tim)

```bash
git fetch origin main && TIP=$(git rev-parse origin/main)
gh workflow run gem-publisher-commission.yml --ref main \  # retired: workflow lives in JovieInc/symphony-control
  -f tip_sha="$TIP" \
  -f confirm=install-jov-6163-publisher
```

## After the run

Download `e1-publisher-commission-observations` and run the live verifier (not
`--self-test`). Do not weaken `maxAgeMs=600000`.
