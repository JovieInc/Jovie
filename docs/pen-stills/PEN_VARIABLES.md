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

## Import into Pen (code -> Pen)

Code tokens are the source of truth. The import files are generated, never
hand-edited:

```bash
pnpm design:tokens:export   # design-system.css, table.styles.ts -> design.tokens.json
pnpm design:pen-import      # design.tokens.json -> docs/pen-stills/pen-import/
pnpm design:pen-import:check  # fails when either generated file is stale (CI)
```

- `jovie-ds.variables.json`: a top-level `variables` object in the same shape
  as a `.pen` file. Colors are dark-primary themed hex values (light is added
  only where a token has one; none do today). Spacing, type sizes, radii, row
  heights and header height are `number` variables in px. Names reuse
  `pen-variable-aliases.json` in reverse (for example `atom-surface-canvas`);
  new names follow `atom-<group>-<token>`.
- `jovie-ds.components.json`: table row-mode heights, header height and cell
  kinds read from code. Compare the Pen "Jovie grid system" Grid Row
  densities against it.

In Pen web, load `jovie-ds.variables.json` into the "Jovie grid system" file.
Never edit the variables by hand: change the code token and regenerate. Pen
frames are the design reference for component structure; code components
mirror them 1:1, by hand. Never write Pen variables back into code tokens.

After editing frames, export the variables back so parity runs on the real
file (see "Replace the seed" above):

```bash
node scripts/invariants/pen-token-parity.mjs \
  --pen "<path to Jovie grid system .pen>" \
  --write-export docs/pen-stills/pen-variables.json
```
