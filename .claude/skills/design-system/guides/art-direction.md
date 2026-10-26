# Art direction

Goal: one cohesive product that is recognizably the same, and finished to Linear/Apple craft. Evolve, do not reinvent: dark first, the Noir Ion palette (ion `#11AFFF`, ultra, pulse, mint, orange, red), Inter UI, Satoshi display.

## Before touching anything
1. Run `/design-canonical` Step 0 to 2: write the one-sentence design read, set DESIGN_VARIANCE / MOTION_INTENSITY / VISUAL_DENSITY, read the smallest context (DESIGN.md section, `docs/design-system/` entry, neighbor components, state matrix). Product, auth, billing and control-plane screens: variance low, motion functional.
2. Pull references and run the anti-copy guard for visual work:
   `pnpm --filter web design-refs pull --surface <surface>` and `pnpm --filter web design-refs guard <screenshot.png>`.
3. Find the existing Pen master and the code owner (`docs/design-system/component-ownership.json`). Change the master, not a one-off screen.

## Craft bar (what "Linear/Apple level" means here, each is checkable)
- Alignment: 4px beat (`--space-*`); controls 28 visual / 44 hit; optical alignment of icons and text baselines; no off-grid arbitrary values (shared-UI arbitrary ratchet counts them).
- Motion: only token durations and easings (`--duration-*`, `--ease-*`); every motion has a hierarchy or feedback purpose; respects reduced motion; no layout shift from state changes.
- Density: scan-first rows, one primary action per region, no nested bordered cards, subtraction before decoration.
- Delight: reserve for peak moments (first release live, first fan, checkout success, profile live). Use `docs/design-system/benchmark-judgment.*` and the benchmark library when merged; do not sprinkle.
- Consistency: one master per concept, variants as instances, one name per noun (IA map in `docs/design-system/` canonical IA when merged).

## Taste and blocking rules (unchanged, enforced elsewhere)
Anti-slop list, copy is the message never the brief (`node scripts/invariants/copy-leak/check.mjs`), general pages stay generic (ICP-language check), logo normalization (`pnpm design:logo-assets:check`), Lucide for UI icons, Jovie mark is the O only. Full text lives in `/design-canonical`; do not copy it into other docs.

## Taste labels
Every time Tim approves or rejects a frame or page (chat, approvals artifact, Pen, design review), capture it so the judges can calibrate: `node scripts/invariants/art-direction/taste-labels.mjs add --id <slug> --surface <text> --verdict approve|reject --words "<his words>" --rules ASR-nnn --image <file> --judge <criterion>=defect|ok`. Data lives in `docs/design-system/taste-labels/`. A judge may block only after enough labels clear the floors (see vision-calibration).

## Variants and review
- Explore with `/design-shotgun` (Pen frames or HTML), pick one, record the choice in the design learning ledger (`docs/design-system/design-learning-ledger.jsonl`).
- Review live pages with `/design-review`; the forms/overflow/media/l10n/browser/a11y gap list is `.agents/skills/gstack/design-review/references/web-interface-gaps.md`.
- Taste feedback is collected after ship, on staging, at 3440x1440 with the Pen master beside it. Do not hold a merge for taste (company policy); propose a default and ship it.

## Output contract
Use the `/design-canonical` output contract in the PR (design read, dials, before/after evidence, checklist, verification). Non-UI doc or skill change: state `UI evidence: not applicable`.
