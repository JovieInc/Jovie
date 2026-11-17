# Uploaded Pen corpus: reconciliation evidence

Observed November 13, 2026, America/Los_Angeles, against repository revision
`f49eba8f9d676ff24ec6fa36035e2f9862ddcfbb`. This is a complete structural review
of the five supplied JSON Pen documents, not a native-render or production
fidelity certificate. Jovie work; no Linear issue — ad-hoc; `gbrain-unavailable`.
The IP address was ignored as requested. The supplied proof-context Python script
was inspected as data and was not executed. Original attachment bytes were
hashed before and after inspection and remained unchanged.

## Complete supplied-file inventory

| Uploaded document | Version | Root nodes / frames | Nodes | Reusable masters / refs | Finding |
| --- | --- | --- | --- | --- | --- |
| Jovie.pen | 2.13 | 2 / 1 | 3 | 0 / 0 | Pencil welcome/starter frame; contains no product design system. |
| Ovie Shipping — task table v0.1.pen | 2.21 | 1 / 1 | 184 | 0 / 0 | Complete task-table proposal, with grouped shipping states and stale-cache guidance. |
| Homepage Art Direction 2026-11-09.pen | 2.22 | 15 / 12 | 1,825 | 0 / 0 | Twelve screen proposals plus three board notes; distinguish selected, pending and draft variants. |
| Marketing Workspace — durable backup 2026-08-09.pen.pen | 2.17 | 106 / 77 | 19,884 | 295 / 97 | Historical marketing/web registry, imported production bodies, receipt images and proposal guides. |
| Marketing Workspace — unsaved recovery 2026-08-09 1640.pen | 2.17 | 107 / 78 | 19,994 | 295 / 97 | Preserves every backup node ID, with additional context and edited existing records. |

The denominator is **231 root nodes, 169 root frames, 41,890 node occurrences**.
Shared marketing snapshots are counted separately; 590 master occurrences do
not mean 590 distinct components. Each document has unique local node IDs;
every local reference resolves, and style-variable aliases resolve. Names such
as SAFE, Verified, dispositioned and LOCKED are source claims, not independently
verified approval or runtime proof.

Full file hashes, every root and its semantic hash, named state candidates,
references, fonts, asset paths and exact repository mappings are retained in
the session artifact `pen-corpus-inventory.json` beside the HTML tracker. The
separate `pen-backup-comparison.json` records the complete backup delta.

## Backup and recovery are related, not interchangeable

Recovery adds **110 nodes and one root**, removes no node IDs, and edits **26
existing nodes across six existing roots**. The added root is `Zvg8C`,
“PRODUCTION FRESHNESS — exact deployed SHA gate.” Variables, fonts, references
and all 295 reusable masters remain. No existing node changes x/y/width/height
or rotation. Edits mainly add registry/proposal context and semantic fill/stroke
bindings. Preserve recovery-only material for reconciliation; do not overwrite
the live canonical document with either attachment. These changes do not prove
a better rendered page or current production parity.

## Carry forward the strongest documented patterns

| Source frame | Recorded state | Candidate to preserve and contract to prove |
| --- | --- | --- |
| Homepage `W3elPK`, Screen 01 | Records F-layout selected on November 9 | One left-aligned hierarchy and product proof, with a stable header/logo; verify current art direction and copy against the current canonical frame. |
| Homepage `v3wsy`, Screen 02 | Explicitly NOT CHOSEN | Retain as an alternate for comparison; do not merge its centered hero into the selected layout. |
| Homepage `qMf4E`, Screen 03 | Pending | One persistent product window/player across tabs; keyboard selection, state continuity and reduced motion must be real behavior. |
| Homepage `EWcms`, Screen 04 | Pending | Visual and active tab agree; pause auto-advance, stop after manual selection and honor reduced motion. |
| Homepage `DTxh4` / `RCsKd`, Screens 06–07 | Pending | Remove repeated product proof; one useful visual per section and one shared content edge. |
| Homepage `kFNR4`, Screen 08 | Pending | Cookie controls remain equally usable and do not cover product proof on mobile; adapt proposed pill sizes through current tokens and interaction targets. |
| Homepage `ZPTvd`, Screen 09 | Pending | Header CTA follows hero visibility rather than a magic scroll offset; header height, logo and login position remain stable. |
| Homepage `V0yU9I` / `o3rUT`, Screens 11–12 | Draft / approve–reject proposals | Preserve profiles/assembled-homepage ideas for comparison. Screen 12 explicitly labels generated imagery as non-final and its search as illustrative; example metrics cannot become live product claims. |
| Ovie `YmbNu` | v0.1 proposal | Keep stale cached rows visible with freshness shown; empty means zero tasks only with fresh evidence. Distinguish failed, blocked, running, queued, reviewed, merged and canceled states. |

This is a structural selection shortlist. Native rendering and comparison of
matching states are required before declaring any candidate visually best.

## Exact coverage against the current repository

- **22 of 29** IDs declared in
  [marketing Pen contracts](../../apps/web/data/marketing/penContracts.ts) occur
  in both historical marketing snapshots. Missing: header `GTcgO`, footer
  `jhV4a`, footer CTA `DiH2U`, final CTA `DKVHD`, prose container `ZVDFa`,
  product gallery `NGW0P` and release-rail gallery `EnK3s`.
- None of the **11 committed app geometry master IDs** occur in these uploads.
  Neither of the **two non-null primitive IDs** in the seven-component
  [conformance manifest](design-conformance-manifest.json) occurs. The other
  five primitive mappings are already null, not missing uploaded nodes.
- The **12 approved homepage binding rows** in
  [pen-bindings.json](pen-bindings.json) point to `home-canonical-v3/index.html`
  and `data-section=…` selectors. They do not bind the uploaded Screen 01–12
  node IDs; a shared subject or a recent filename does not establish identity.
- None of the uploads contains the supplied native sign-in screenshot's Touch
  ID, signing-in, unreachable-service or browser-return text. Historical web
  `/signin` and `/desktop-auth` imports do not cover that native state matrix.

## Remaining input and proof gaps

Both marketing snapshots require the same **81 missing images and three font
files** under their sibling `Jovie Marketing Workspace/` asset tree. The
homepage board requires `plate-hero-floor-v3.png`, `plate-footer-asphalt-v3.png`
and `tim-avatar-bw-v3.png` from its imagery folder. No matching files were found
in the uploads or repository. Pen CLI is unavailable here; no faithful native
render was fabricated from a partial HTML reconstruction.

The precise additional source is the current **Jovie Design Studio —
canonical.lib.pen**, its required sibling fonts/images, and the native sign-in
frame shown in the supplied screenshot. Those are more useful than another
general file dump. Current public production separately returns
`DEPLOYMENT_PAUSED`; see [the production audit](pen-production-audit.md).

**Ship now:** retain the corpus inventory and recovery delta; harden existing
source/state/evidence contracts and land the measured certification work.
**Re-evaluate when:** current canonical sources, assets and a reachable exact
deployment produce matching-state native renders. **Then:** choose the best
variants through the existing authority/parity workflow, commit hash-bound
exports, and add deliberate-drift/stale-reference RED and repaired GREEN proof
under the [existing sprint owners](design-ia-certification-sprint.md).
