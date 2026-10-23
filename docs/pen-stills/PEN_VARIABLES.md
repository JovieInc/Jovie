# Pen variables

Dark is the primary mode. Light values may be stored on a variable and are
not compared. The homepage headline stays locked: **Be found. Be understood.**

The live Pen file is not in this repo. Pen's CLI exports PNG, JPEG, WEBP, and
PDF, not variables. A `.pen` file is JSON, and its top-level `variables`
object is the source. CI compares the committed export
`pen-variables.json` with `design.tokens.json`.

## Replace the seed

The committed export is a seed of three colors that already match Noir Ion.
`coverage` is `seed`, so the check reports `incomplete-export`. That id is
the only baseline allowance. A new finding id fails.

On the design machine, from the repo root:

```bash
node scripts/invariants/pen-token-parity.mjs \
  --pen "$HOME/Documents/Jovie/Jovie Marketing Workspace/Jovie Homepage Profiles Claim — review copy 2026-10-01.pen" \
  --write-export docs/pen-stills/pen-variables.json
```

That writes `coverage: full`. Do not commit the `.pen` file. If the file is
not JSON, the command stops. Review the new `unmapped:` findings: alias a
color to `color.*` in `pen-variable-aliases.json` when it is the same token,
or add only accepted pre-existing ids to `pen-variable-baseline.json`. A
value that differs from `design.tokens.json` fails until the token or the
Pen variable changes. Do not baseline a real mismatch to hide it.

```bash
node scripts/invariants/pen-token-parity.mjs
```

Exit 0 when every finding id is already in the baseline. Exit 1 when a new
id appears. Stale baseline ids are warnings.
