# Art direction

Goal: one cohesive product that is recognizably the same, and finished to Linear/Apple craft. Evolve, do not reinvent: dark first, the Noir Ion palette (ion `#11AFFF`, ultra, pulse, mint, orange, red), Inter UI, Satoshi display.

## Before touching anything
1. Run `/design-canonical` Step 0 to 2: write the one-sentence design read, set DESIGN_VARIANCE / MOTION_INTENSITY / VISUAL_DENSITY, read the smallest context (DESIGN.md section, `docs/design-system/` entry, neighbor components, state matrix). Product, auth, billing and control-plane screens: variance low, motion functional.
2. Pull references and run the anti-copy guard for visual work:
   `pnpm --filter web design-refs pull --surface <surface>` and `pnpm --filter web design-refs guard <screenshot.png>`.
3. Find the existing Pen master and the code owner (`docs/design-system/component-ownership.json`). Change the master, not a one-off screen.

## Craft bar (what "Linear/Apple level" means here, each is checkable)
- Alignment: column layouts per [grid.md](grid.md); 4px beat (`--space-*`); controls 28 visual / 44 hit; optical alignment of icons and text baselines; no off-grid arbitrary values (shared-UI arbitrary ratchet counts them).
- Motion: only token durations and easings (`--duration-*`, `--ease-*`); every motion has a hierarchy or feedback purpose; respects reduced motion; no layout shift from state changes.
- Density: scan-first rows, one primary action per region, no nested bordered cards, subtraction before decoration.
- Delight: reserve for peak moments (first release live, first fan, checkout success, profile live). Use `docs/design-system/benchmark-judgment.*` and the benchmark library when merged; do not sprinkle.
- Consistency: one master per concept, variants as instances, one name per noun (IA map in `docs/design-system/` canonical IA when merged).

## Taste and blocking rules (unchanged, enforced elsewhere)
Anti-slop list (ASR-020; all rule ids and status: `node scripts/anti-slop/run.mjs list`), copy is the message never the brief (ASR-017) (`node scripts/invariants/copy-leak/check.mjs`), general pages stay generic (ICP-language check), logo normalization (`pnpm design:logo-assets:check`), Lucide for UI icons, Jovie mark is the O only. Full text lives in `/design-canonical`; do not copy it into other docs.

## Taste labels
Every time Tim approves or rejects a frame or page (chat, approvals artifact, Pen, design review), capture it so the judges can calibrate: `node scripts/invariants/art-direction/taste-labels.mjs add --id <slug> --surface <text> --verdict approve|reject --words "<his words>" --rules ASR-nnn --image <file> --judge <criterion>=defect|ok`. Data lives in `docs/design-system/taste-labels/`. A judge may block only after enough labels clear the floors (see vision-calibration).

## Variants and review
- Explore with `/design-shotgun` (Pen frames or HTML), pick one, record the choice in the design learning ledger (`docs/design-system/design-learning-ledger.jsonl`).
- Review live pages with `/design-review`; the forms/overflow/media/l10n/browser/a11y gap list is `.agents/skills/gstack/design-review/references/web-interface-gaps.md`.
- Taste feedback is collected after ship, on staging, at 3440x1440 with the Pen master beside it. Do not hold a merge for taste (company policy); propose a default and ship it.

## Art-direction loop (Pen page to one proposal, about 20 minutes)

Use this for any page designed in Pen before code (Pen-to-code pipeline, contract §6). The art director decides: present Tim ONE canonical proposal. Present two only when they are undecidable on his stated rules, and say exactly which rule you could not decide. Never mark anything approved; approval is Tim's (`approved` receipt in `docs/design-system/pen-bindings.json`).

1. **Brief (2 min).** Write one paragraph: concept, named references (for example Linear's homepage section rhythm, Apple product-page photography), grid (columns, margin, gutter, baseline), type scale (display, section, lede, body, with px leadings) and image direction. Read the hard rules first: dark matte near-monochrome, approved people only, no text on artwork that has text, no music cliches, logo 28px, no dead ends, artist dignity, generic ICP on general pages (memory `feedback_*` files and `/design-canonical`), plus [grid.md](grid.md).
2. **Canvas (1 min).** `.claude/rules/pen.md` forbids creating documents, so a "side file" is the open proposal file, never `canonical.lib.pen`. Confirm with `get_app_state` that the active path is that file and no other writer holds it. Put each page in one top-level frame named `<PAGE> CANONICAL PROPOSAL / <viewport> · not approved`.
3. **Reuse before drawing (2 min).** Find the masters with one `Get` visitor (header, footer, phones, buttons, library art, real catalog image fills) and use `ref` instances. Use only real content: the owner's real profile phone and release covers, never "Your Name" or an empty screenshot.
4. **Compose (6 min).** One `execute` per section. Name each section frame exactly as its `data-pen-section` id (`hero`, `profile`, `releases`, `invite`, `footer`). Give every section frame a canvas fill so a per-section still is never transparent. Keep one alignment axis for the whole page. Place blocks on column lines (width = n x column + (n-1) x gutter). Build the narrow viewport as its own frame (`marketing-viewport: narrow` theme and the narrow header and footer instances), not a squeezed copy.
5. **Measure (2 min).** With `Get` visitor bounds, check that text-block left edges are on column starts (inline items excepted, and listed), that text tops modulo 4 are 0, that section heights are multiples of 4, that there are no `problems`, and that no solid fill or stroke uses raw hex. Measure the logo position against the copy axis: locked header masters can carry an inner inset.
6. **Export and critique, at least 3 rounds (6 min).** Export one page per `Export` call (a combined export can time out the MCP). Score every round with Clef: `node scripts/invariants/clef-screenshot-evaluator.mjs --profile marketing --surface "<page> round N" <full-1440.png> <full-390.png>` (run it from a checkout with `node_modules`). Then LOOK at the PNG yourself as a demanding buyer: is it one axis, is there dead space, are there nested boxes, repeated links, uneven wraps, or anything off the hard-rules list? Fix the top three issues and re-export. Log each round's Clef pViolations and your notes.
7. **Hand off (1 min).** Write `scratchpad/<page>-finalists/canonical/<viewport>/<section>.png`, `full-<viewport>.png` and `report.json` (`nodeIds`, `clefScores` per round, `checksPassed`, `knownGaps`). Call `save()` without a path and confirm the file's mtime and size moved. Known gaps are stated, not hidden: gradient alpha stops that cannot reference tokens, display side-bearing (rule 5 belongs in the code primitive), and locked masters that sit off the page grid.

Rubric (each item is pass or fail; a fail is fixed, or listed in `knownGaps` with the reason): hard rules · grid columns · 4px baseline · tokens only · real content (no placeholder or blank media) · one axis · one primary CTA per region and no duplicate CTA in the header · no dead-end links · Clef pass · references honoured (rhythm, restraint, photography).

## Output contract
Use the `/design-canonical` output contract in the PR (design read, dials, before/after evidence, checklist, verification). Non-UI doc or skill change: state `UI evidence: not applicable`.
