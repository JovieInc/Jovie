# Design Learning Ledger

The source ledger is `design-learning-ledger.jsonl`. It extends the existing
Design Lab taste-memory domain without turning the unversioned
`agentos/memory/design-taste.md` projection into authority.

Lifecycle: `captured -> classified -> corroborated -> conflict-checked ->
proposed -> accepted|rejected -> enforced|expired`.

- A single correction cannot rewrite canon unless the founder uses explicit
  global language such as `canonical`, `always`, or `ban`.
- Other candidates require corroboration on two independent surfaces or an
  explicit approval receipt.
- An LLM may review a candidate, but cannot accept it. Preserve provider,
  model/version, prompt digest, verdict, calibration version, and score.
- Conflict checking binds the candidate to `DESIGN.md` and registry digests.
- Accepted rules update the correct authority, executable lint/evals/tests, and
  relevant agent/Pen prompt packets in one source change.
- Rejections and false positives remain append-only negative examples.
- Replacements require `supersedesEntryId`; rollback never erases history.

Screenshot references are evidence pointers, not embedded binaries. If before
or after evidence was not captured, the entry must say so and cannot claim
visual proof. Pen receipts establish Pen state only; they never establish source
identity or propagation alone.

## Logo normalization ownership

- Math/API: `packages/ui/media/logo-normalization.ts`
- Per-asset authority: `apps/web/data/design/logo-assets.json`
- Web renderer: `apps/web/components/media/NormalizedLogoAsset.tsx`
- Alpha measurement/QA: `scripts/logo-asset-normalization.mjs`
- Agent prompt: `.agents/skills/gstack/design-canonical/SKILL.md.tmpl`

The current smallest slice moves the canonical Trust Logo Bar onto this shared
API and measures the raster asset deterministically. The registry already holds
the full five-asset batch, so later press-kit, flyer, artist-profile, and manager
sheet consumers can adopt it without copying crop or scale corrections.
