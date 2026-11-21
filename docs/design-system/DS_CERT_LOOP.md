# Design-system certification loop

One loop finishes design-system certification and keeps it finished. Any
worker can run it: Claude, Codex, or Summer. A component is done when it
passes every static criterion (`ds-owner`, `tokens`, `states`, `tests`,
`a11y`, `frontend-rules`, `forced-caps`) and a gate entry holds all seven,
so the shrink-only gate fails any later PR that breaks it.

```sh
node scripts/ds-cert-loop.mjs status            # how many are left
node scripts/ds-cert-loop.mjs plan --out-dir tmp/ds-cert-loop   # work orders
node scripts/ds-cert-loop.mjs verify --order tmp/ds-cert-loop/dsc-01.json
node scripts/ds-cert-loop.mjs gate --shard <branch> --order <order>
```

## The loop

1. **Find.** `status` runs the static certifier and lists every component
   that fails a criterion or has no full gate entry.
2. **Plan.** `plan` cuts that list into work orders of 30 components in path
   order, so orders rarely touch the same files.
3. **Fix.** A worker takes one order on its own branch and fixes the source
   or adds the missing evidence. Fixes follow the certifier's own spec
   (`node scripts/component-certificate.mjs --component <path> --spec`).
4. **Lock.** `gate --shard <branch> --order <order>` adds a gate entry for
   every component in the order that now passes. New keys go to the
   branch's own shard in `component-certification.d/`, so batch PRs never
   conflict. A key another file already names is widened in place.
5. **Verify.** `verify --order <order>` exits 0 only when every component in
   the order is done. Anything else is listed, and the worker iterates on
   that list. A component that needs a product decision goes in the order's
   `skipped` map with the reason, and is reported, never silently dropped.
   A skipped component must not keep a gate entry: if you reverted it after
   `gate`, remove its entry, or `verify` fails.
6. **Ship.** One PR per order, labelled `codemod`, merges on green.
7. **Repeat** until `status` says 0. Then the loop stands down; the gate keeps
   the result.

## Rules for workers

- Never raise a baseline, weaken a test, or remove a gate entry.
- Never edit another branch's shard.
- `verify` is the definition of done. A PR whose order does not verify does
  not ship.

## Design calls already made

Tim's rule for taste (Nov 21): "make the most apple call when it comes to
taste and choose for em". So a worker does not skip a component as a "design
call" when its case is below. It applies the call, accepts the small visual
change, and puts a before and after screenshot in the PR. `skipped` is left
for a real product decision, such as deleting a feature, and says which one.

- **A field that draws its own visible surface** (border or fill): use the
  `@jovie/ui` atom at its nearest size (`Input`, `Textarea`, `NativeSelect`,
  `Checkbox`, `Switch`, `RadioGroup`, `SegmentControl`) and take its look. One
  field look everywhere beats a bespoke radius or height.
- **A bare inline field** (search pill, command palette, chat composer, inline
  edit, lyric line, toolbar select): wrap it in `CompositeField` (pick
  `surface`: `none`, `field`, `shell` or `page`) and render the control as
  `HostDrawnInput`, `HostDrawnSelect` or `HostDrawnTextarea` with layout
  classes only. Put type and colour on a plain element around the field; the
  control inherits them and the container draws the focus ring. Never pass
  type or colour classes to the control or to `CompositeField`.
- **A hidden file input, a chip radio or a listbox mirror**:
  `HostDrawnInput type='file'` (or `type='radio'`) with `visuallyHidden`, or
  `className='hidden'` where it must not be focusable.
- **A range slider**: `HostDrawnInput type='range'` with the platform's native
  look. Do not rebuild a custom track.
- **Brand colours** (Spotify, Bandsintown, Google, flags, platform
  fallbacks): read them from the existing registries
  (`apps/web/lib/dsp-registry.ts`, `apps/web/constants/platforms/data.ts`)
  and pass them through `style`. Add a missing brand to that registry, never
  as a Tailwind arbitrary class.
- **Near-black scrims, panel gradients, glows and rgba shadows**: snap to the
  nearest existing token (`bg-page`, surfaces, `black/N` or `white/N`
  overlays, shadow tokens). A glow that has no token goes.
- **Categorical or decorative hues** (type badges, per-kind colours, stat
  tiles): neutral. Status colours mark status only and accent marks actions
  and selection only.
- **A theme-dependent white or black button** (`bg-white text-black`
  with dark overrides): the primary `Button` variant, which already flips per
  theme.
- **A native `<dialog>` with `showModal`**: the `Dialog` or `Sheet` organism.
  A non-modal banner is a plain landmark region, not a dialog.
- **`autoFocus` meant as "focus when it opens"**: move focus in the handler
  that opens it, or through the overlay's own `onOpenAutoFocus`. Keep the
  behaviour.
- **Loading that returns `null`**: a skeleton of the final size.
- **A file over 500 lines or a test that needs too many mocks**: split the
  file first, then certify each part.
- **Existing lint debt in a touched file**: fix the debt in the same PR.
- **A component nothing imports**: delete it and its stories and tests.

## Lessons from the Nov 21 run

- After any batch PR merges, merge main into every open batch branch before
  the next CI run. Main's shrink-only baselines move under them.
- Recurring merge conflicts: `docs/design-system/cert-screens.json` takes
  main's file and reruns `node scripts/component-cert-screens.mjs --refresh`;
  `scripts/design-authority-interactive-baseline.json` takes main's file and
  shrinks it again. The structural lane's design-authority guard is exact
  match, so a branch must shrink that baseline whenever it removes raw
  controls.
- Waiver identities must be unique across all `component-certification.d`
  files. Run `node scripts/component-certificate.mjs --gate` before every
  push, not only the PR checks.
- PR Size Guard measures the PR head's tree. When main has freed space,
  merge main into the branch; rerunning the check is not enough.
- Before claiming a component, check `plain-button-scope.json`, the source
  ratchet and the System B style guards, which certification does not run.
