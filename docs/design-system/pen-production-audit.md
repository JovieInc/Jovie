# Pen-to-production certification snapshot

Initial repository snapshot on 2026-11-13, against source `f49eba8f9d`, before the five Pen uploads. See the subsequent [uploaded-file census](uploaded-pen-corpus-audit.md). This is an audit receipt and
sprint input, not a new design authority or a claim that every native Pen
document was inspected. Sources below remain authoritative.

## Current constraint

The approved homepage reference can be read, but current production cannot be
visually qualified. At 17:19 Pacific, both HTTP readback and a browser showed
`https://jov.ie/` returning **503 / DEPLOYMENT_PAUSED**. The strict 12-frame
comparison failed closed with no comparable images. Chromium additionally
reported `ERR_CERT_AUTHORITY_INVALID` in this environment. An observational
screenshot of the 503 used a local certificate-error override; the actual
certification capture kept certificate validation enabled. Neither the 503
image nor the harness's synthetic triptych is visual-fidelity evidence.

## Accessible inventory

| Inventory | Current evidence | Qualification gap |
| --- | --- | --- |
| Native `.pen` documents in this checkout/workspace | 0 | Local files on the design machine are unavailable here; this says nothing about their contents or unsaved state. |
| Versioned native workspace profiles | 2, in [workspace locks](../../scripts/agent/pen-workspace-locks.json) | Both semantic-manifest authorities are `unavailable`. The two canonical paths name Design Studio and Marketing Workspace. |
| Approved route bindings | 48 routes: 40 marketing, 8 golden-path | [Bindings](pen-bindings.json) contain 1 bound route (`/`) and 47 unbound routes. |
| Homepage canonical stills | 12 present, 12 matching SHA-256 | Six sections at 1440 and 390: hero, profile, releases, specs, invite, footer. Approval names `home-canonical-v3/index.html`, not an inspected native Pen file. |
| Authenticated screen registry | 112 screens, 48 design references, 7 components, 4 recipes, 8 archetypes | This denominator is separate from the 48 marketing/golden-path binding routes. |
| App component Pen identities | 3 bound roots of 7 components; all 7 reference-ineligible | Shell, table and entity sidebar are bound; pending decisions still block promotion. |
| Historical geometry export | 11 masters, read 2026-09-27 | This is live-canvas readback, not a current saved-file/cold-readback proof. |
| Current scalar parity decisions | 10 pending differences plus 1 anatomy hold | [Parity contract](../../apps/web/data/appScreens/penParity.ts) covers sidebar/header, table insets, toolbar/nav insets and entity-header ownership. |
| Marketing component registry | 38 identities, 26 unique Pen root IDs | Source identities and historical IDs do not prove current native-frame fidelity. |
| Conformance manifest | 7 source-bound components | [Verified export](design-conformance-manifest.json) remains `unavailable`; source-bound is not founder-locked Pen certification. |
| User's native sign-in screenshot | Four visible state compositions: submitting, recoverable error, Touch ID offer, Touch ID choice | A user-provided design reference; neither native document enumeration nor the installed Mac app was inspected. |

The existing read-only archive inspector was attempted with query `.*`. It
recorded `PEN_CLI_KEY` and `PEN_GOLDEN_PATH_FILE_URL` missing and inspected zero
files. No native document was opened, saved, renamed, or mutated.

## Reference traits to carry forward

All 12 approved homepage stills were visually inspected. Their consistent
traits are one dominant action, dark canvas with restrained blue light,
large editorial headings, clear section order, product imagery that shows
real release/profile work, and a mobile composition that changes the layout
instead of shrinking desktop type. Keep these traits in the selected source
owners; resolve current copy, navigation and product facts through their
existing registries rather than freezing screenshot text as a second source.

The supplied native sign-in design additionally makes loading, recovery and
biometric choice explicit. Its implementation contract should cover stable
control geometry across those states, disabled duplicate submission, readable
errors, a working browser fallback, keyboard focus and reduced motion. A
browser screenshot cannot certify OS Touch ID or a signed Mac binary.

## Contracts and sprint order

1. Restore a reachable immutable production deployment and rerun the existing
   strict comparison against that exact build. Preserve redirects as
   non-comparable captures and retain all 12 existing tolerances/hash checks.
2. Produce a complete, authorized native-file inventory using the existing
   workspace coordination contract. Record original path, file digest, frame
   identity, state, viewport, source owner and source/build digest. Preserve
   exploration/recovery files as evidence; never silently replace a canonical
   master. An inspector's default hit cap is not complete enumeration.
3. Group alternatives by source concept, compare them beside real rendered
   states, and select one master/family per concept. Capture both desktop and
   mobile; cover loading, empty, error, disabled, focus, long-content and
   reduced-motion states where applicable. Reconcile the 10 current scalar
   discrepancies and entity-header hold before claiming Pen eligibility.
4. Extend the existing binding/registry system to the highest-traffic unbound
   routes first. Require a real approval receipt and matched still hashes;
   use Storybook for isolated states and the deployed route for integration.
   Keep deterministic correctness, accessibility and boundary checks blocking.
5. Ship small source-owner fixes through ordinary required checks and the
   native merge queue. Recheck the deployed build before closing fidelity
   work. Source tests, Pen readback, merged code and production proof remain
   separate receipts.

**Ship now:** reuse one browser per Pen comparison while keeping each frame
in its own isolated page/context. Missing stills, hash failures and absent
targets still launch no browser; failed captures still fail strict mode;
disconnected browsers are replaced before the next capture.

The audit also found that frame/duplicate identities omitted route and story.
Two bound routes using the same section and native node IDs could collide in
generated triptych names, or be rejected as duplicate legacy frames. Receipts,
duplicate keys and artifact hashes now include the target identity; repeated
frames on the same target still fail. Each target keeps its own image and
comment reference, while the existing single-image `triptych.png` alias remains.

**Measurement:** three paired Chromium fixture runs of 12 screenshots reduced
launches from 12 to 1 and median lifecycle time from 3,347 ms to 1,123 ms
(66.4%). Samples before: 3,312 / 3,430 / 3,347 ms; after: 955 / 1,123 / 1,212 ms.
This measures browser startup/page/screenshot overhead, not a production
end-to-end speedup. The 1,500 ms render wait and all comparison rules remain.

**Re-evaluate when:** the complete deployed route matrix is available.
**Then:** use measured capture p50/p95 and failure rates to choose bounded
parallel capture or capture batching, retaining state isolation and full
evidence. Prefer the existing System-1 advisory seam for prioritization;
model probabilities do not replace deterministic checks or approval receipts.
