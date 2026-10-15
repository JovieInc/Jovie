<!--
spec-version: 1.4.0
doc-freshness: docs/marketing/DESIGN_INVARIANTS.md
-->
# Marketing design invariants

Owner: Jovie marketing/design owner; change authority: Tim White. Effective: 2026-09-13.

This is the scoped founder-direction register discovered through [DESIGN.md](../../DESIGN.md)
and the [Marketing Agent Guide](./AGENT_GUIDE.md). It extends those authorities;
it is not a second executable registry. [JOV-INV-019](../../canon/invariants.jsonl)
continues to own executable design-agent invariants and generated projections.
Do not infer automated enforcement from a rule being recorded here.

Evidence: founder discussion in task `01a09cc0-9fe7-7fc3-9206-cb4884d85a4d`
(Homepage and Changelog Design), relayed to design task
`01a09cde-bfe6-7da0-99ca-bf17acca6a96`; direct corrections in that design task.
Evidence summaries below are paraphrases unless quoted. The founder expressly
requested this register: “make sure all the direciton in this thread becomes
invariants to let the agents design bettter.” Assistant ideas are not approvals.

**Status vocabulary:** requirement = founder direction; approved composition =
specific visual acceptance; viable = eligible for comparison, not a winner;
proposal = not accepted; rejected = do not revive as routine polish. Runtime,
save, publication, and conversion evidence remain independent of all five.

Every rule below inherits this discovery entrypoint. A new explicit founder
instruction can change its named scope; record the new evidence and affected
IDs. Reversible implementation choices inside that scope need no new approval.
Do not use this register as a new human merge gate; preserve JOV-INV-028.

## MKT-D01 — One canvas, one owner, quick visible iteration

- **Scope:** marketing design execution, shared Pen components, review handback.
- **Requirement:** use the existing canonical marketing canvas and reusable
  library/atoms; establish one writer per overlapping source scope. Coordinated
  writers may work on disjoint nodes. Show a real render quickly and vary
  one coherent set of decisions. Keep other copy, style, and layout fixed until
  the task authorizes that scope. Do not repeatedly ask permission to begin.
- **Founder evidence/status:** requirement; repeated requests to work directly
  in Pen, move quickly, and preserve unrelated surfaces. The current file is
  `Jovie Design Studio — canonical.lib.pen`; resolve its exact path through the
  [workspace lock](../../.claude/rules/pen.md), not an assumed filename.
- **Enforcement:** verify editor identity, ownership and component references;
  inspect rendered output at intended size. Report canvas mutation, render,
  saved source, cold readback, source implementation, and runtime separately.
- **Change/exception:** deliberate shared-master changes affect only their
  authorized family; no unrelated locked app-sidebar rebrand. After transport
  loss follow the workspace lock, preserve the checkpoint, and stop mutations.

## MKT-D02 — Broad visibility positioning, concrete promise

- **Scope:** homepage narrative and audience brief, not every product surface.
- **Requirement:** primarily address founders/investors discovering Tim through
  Twitter/X; present a broad AI company working on visibility while remaining
  intelligible to artists. Do not reduce the company to music-only identity or
  replace concrete value with vague AI-lab language.
- **Founder evidence/status:** requirement; broad company direction and
  founder/investor audience supersede the legacy homepage DJ-only brief.
- **Enforcement:** editorial review must identify the audience, visibility
  problem, and real next action. Verify every capability, customer and traction
  claim against current evidence; enterprise applicability is ambition, not
  evidence of enterprise customers or implemented enterprise features.
- **Change/exception:** artist-specific pages retain their audience. Further
  expansion of the homepage promise needs scoped founder direction and truth checks.

## MKT-D03 — Restrained hero with an explicit scroll contract

- **Scope:** homepage hero, header relationship, logo bar.
- **Requirement:** premium balanced spacing and restrained headline scale; the
  original oversized type was rejected. Keep current hero copy. Header belongs
  to the initial hero and floats only after scroll. The hero transitions into
  an inset rounded editorial box, with the logo bar below; no clipped or
  fade-cropped logos.
- **Founder evidence/status:** required composition/motion direction; existing
  initial/scrolled Pen frames describe the transition, not running animation.
- **Enforcement:** review initial/scrolled and narrow layouts; runtime browser
  tests must exercise scrolling, reduced motion, stable geometry, header state
  and visible logo bounds. A pair of stills is not a motion test.
- **Change/exception:** scoped hero-copy or motion changes need new direction;
  responsive wrapping must preserve legibility rather than shrink type arbitrarily.

## MKT-D04 — Header grouping and Jovie lockup

- **Scope:** canonical marketing header, docked/floating/narrow states.
- **Requirement:** closely follow Cursor's grouping: left mark/wordmark,
  centered truthful navigation, right account/conversion hierarchy. Preserve
  Jovie's existing circle shape; use smaller clean modern Jovie text to its
  right with canonical typography. Do not copy the Cursor cube or wordmark.
- **Founder evidence/status:** requirement; explicit header IA and logo-type
  authorization superseded the earlier keep-type-fixed restriction only here.
- **Enforcement:** resolve labels/routes from [marketing navigation](../../apps/web/data/marketingNavigation.ts)
  and current route contracts; inspect all header states and menu behavior.
  Models, Enterprise, Contact sales or Download are not licensed by a reference.
- **Change/exception:** retain the marketing mark's canonical geometry unless
  separately changed; no global/sidebar mark edits. Reference similarity never
  authorizes invented destinations or unsupported functionality.

## MKT-D05 — Choose the medium before the component

- **Scope:** homepage editorial section and reference interpretation.
- **Requirement:** dense product screenshot callouts were rejected as a medium.
  Research the communication goal, then select graphic, photo, video or
  interaction. Direction: fragmented presence becomes coherent; begin with a
  strong still and optionally add restrained motion. Do not revive artist-name,
  album-promo, screenshot-collage or label/connector diagrams as cosmetic polish.
- **Founder evidence/status:** editorial conceptual direction accepted; the
  monochrome photographic assembly was included in the subsequently approved
  homepage first pass. That acceptance is scoped to the composition, not a
  blanket lock on other imagery or a completed gradient refinement. The desktop Library screenshot was explicitly for the
  right rail.
- **Enforcement:** render review checks concept, hierarchy and actual readability;
  provenance distinguishes conceptual art from product proof. Deliberate owned
  art follows the existing scene-first palette policy; protected source colors
  remain truthful. Never portray the Library reference as homepage runtime proof.
- **Change/exception:** other pages may use registry-backed product proof when
  appropriate. Revisiting the rejected homepage medium requires explicit direction.

## MKT-D06 — Supporting copy belongs to the composition

- **Scope:** section heading/support relationships and editorial readability.
- **Requirement:** concise supporting text must align with and balance its
  heading. No stranded paragraph, weak blurry grey or unreadably faint text.
- **Founder evidence/status:** direct correction: tighten the right-side copy;
  it felt out of nowhere and unbalanced, with weak/blurry grey. This separately
  authorized editing that supporting copy.
- **Enforcement:** inspect actual-size desktop/narrow renders, line lengths,
  alignment and contrast. Use real computed foreground/background contrast for
  source UI; aesthetic balance still requires rendered review.
- **Change/exception:** use canonical semantic tokens, not arbitrary global
  palette edits to repair one instance. No automatic “approved” label for our revision.

## MKT-D07 — Changelog as an image-led timeline

- **Scope:** changelog page and homepage release previews.
- **Requirement:** closely follow actual Cursor changelog structure: narrow
  reading column, sticky date rail, large editorial images, restrained hierarchy.
  Keep Jovie's system and real published release dates/copy; exclude internal,
  unpublished or empty release entries. Homepage previews share the same
  entry/artwork family. Deliberate gradient-and-type artwork is valid. Changelog
  page and homepage-preview artwork use the shared 16px radius token with actual
  clipping. Homepage changelog and shared blog preview cards put equal-ratio
  artwork FIRST, full titles BELOW, then compact category/date metadata. Reserve
  media dimensions before loading; below-image titles wrap naturally. This
  supersedes title/date-above-image and fixed title-height alignment workarounds.
  The full changelog retains its separate sticky-date timeline. Blog posts,
  category pages and related cards reuse the editorial family; show only matching
  articles in a named category and label cross-category recommendations separately.
- **Founder evidence/status:** explicit Cursor timeline request and request for
  editorial images inspired by ElevenLabs/OpenAI; later accepted image-first
  preview direction supersedes earlier title-above-image studies. Design
  acceptance does not itself certify the implemented or deployed result.
- **Enforcement:** inspect reference pixels and real scroll behavior, record
  initial/scrolled date-state contract in Pen, then test Jovie runtime separately.
  Verify publication sources, legibility, consistent media ratios and narrow flow.
  Editorial gradients must communicate the entry, not supply generic filler.
- **Change/exception:** collapse the rail naturally on narrow screens; never
  borrow another vendor's releases, assets or unverified behavior claims.

## MKT-D08 — The footer agent action copies useful instructions

- **Scope:** closing CTA composition and clipboard interaction.
- **Requirement:** simple centered single-line desktop headline, generous space,
  primary action and secondary “Onboard your agent”; wrap naturally on narrow
  screens. The secondary is explicitly a copy-to-clipboard action for pasting
  instructions into an agent, not navigation or a decorative copy glyph.
- **Founder evidence/status:** “the copy/paste button is the key though”; later
  “that footer cta is great” approves the displayed K4ar1 composition with
  “Take control of your presence.” / “Find your profile” / “Onboard your agent”.
  This is historical acceptance. The September 14 scoped correction relayed
  through the marketing coordinator calls for “See what world sees”,
  “Start with your name”, “Find me”, and a thin “Onboard your agent” treatment.
  It supersedes the older closing-copy reference only. Resolve exact current
  wording, desktop/mobile nodes and geometry from the saved canonical source;
  the historical K4ar1 export is not current saved-source proof.
- **Enforcement:** visible copy affordance, accessible name/focus/target; show
  success only after clipboard resolution and announce it. On rejection provide
  selectable instructions. Test default, pending, success and failure behavior;
  review the exact useful payload against verified docs/capabilities.
- **Change/exception:** preserve approved composition while allowing scoped
  headline study. Existing payload was a draft, not operational proof. Inspect
  [CLI documentation](../../packages/jovie-cli/README.md) and live public docs
  before finalizing; no invented integrations, vendor logos or credential flow.

## MKT-D09 — Test distinct propositions, not shuffled words

- **Scope:** CTA copy exploration and reports of experiment outcomes.
- **Requirement:** assess materially different propositions from first
  principles; then compare strongest options in identical geometry with one
  primary action held constant. Evaluate clarity, specificity, credibility,
  rhythm, audience and fit. Isolate primary-label experiments from headlines.
- **Founder evidence/status:** heavy copy exploration requested. The
  September 13 baseline was “Take control of your presence.”; “Shape how the
  world sees you.” and “Your next chapter starts here.” were viable study
  choices. MKT-D08 records the later scoped closing-CTA correction.
  “Put your presence to work.” is explicitly rejected as weird shuffled copy
  without a natural lead idea. Other three were not rejected.
- **Enforcement:** semantic/editorial review plus controlled rendered comparisons.
  Scores or attractive stills are not A/B, conversion or causal evidence.
- **Change/exception:** no conversion winner or permanent exact-wording lock is
  implied. Do not quietly reintroduce the rejected line in future candidate sets.

## MKT-D10 — Interactive examples explain one real transition

- **Scope:** bounded homepage interaction studies inspired by Linear.
- **Requirement:** ample space, one understandable initial/action/result flow,
  real Jovie capabilities and canonical components. Do not restore dense
  callouts or fake a functioning chat, agent or third-party integration.
- **Founder evidence/status:** Linear praised as reference for interactive
  examples. Observed MCP+ click opens a details modal; staged cards alone do
  not prove live agent execution.
- **Enforcement:** inspect the reference action, document what changed, design
  initial/action/result plus failure/keyboard states, and test Jovie behavior
  separately. Fixtures must be explicitly controlled and side-effect free.
- **Change/exception:** a study is not authorization to replace the whole homepage.
  Conceptual demos must never be reported as production execution proof.

## MKT-D11 — Truthful theme and language preferences

- **Scope:** footer system/light/dark control and locale selector.
- **Requirement:** reuse [ThemeToggleSegmented](../../apps/web/components/site/theme-toggle/ThemeToggleSegmented.tsx)
  and existing theme substrate; preserve system behavior, persistence, first
  paint, hydration and accessibility. The explicit 2026-09-13 functional theme
  request supersedes prior dark-only policy only through a declared marketing-
  route opt-in. Preserve public artist profile, other public and app theme
  contracts; do not remove forced-dark behavior from a shared public layout
  indiscriminately. Offer only actually supported locales.
- **Founder evidence/status:** requested functional theme/locale controls, with
  additional languages only where SEO or product growth benefits. English was
  the only locale verified in this session; that is dated evidence, not an eternal limit.
- **Enforcement:** test selected state, keyboard, persistence, system changes,
  first paint and contrast in both themes; use actual homepage-instance renders.
  Require the source owner’s exact opt-in route map and actual light/dark
  parity before claiming rollout. Light-theme parity is not verified by this
  register. A dark board with Light selected proves selection styling only. Gate the
  locale selector until another supported translation exists; verify routes,
  content and fallback. Rank additions by Jovie search demand, qualified traffic,
  conversion, product growth and translation/support readiness.
- **Change/exception:** no vendor-language-list or population-ranking shortcut.
  No dataset means unknown demand, not an invented locale shortlist. Re-evaluate
  with real demand and translation evidence; then ship the smallest justified set.

## MKT-D12 — CLI presentation follows a verified contract

- **Scope:** Jovie CLI marketing page design, not new CLI infrastructure.
- **Requirement:** closely follow eve.dev composition: centered hero,
  human/agent command presentation and clear terminal examples; retain Jovie
  system and actual read-only commands. Eve's audience switch was observed to
  change its command pill; its claims and install commands are not Jovie's.
- **Founder evidence/status:** explicit request to nearly clone the page layout.
  [CLI source](../../apps/web/components/marketing/CliLandingPage.tsx) and README
  document anonymous profile/context/OpenAPI/documentation reads.
- **Enforcement:** trace every displayed command to source; separately verify
  registry availability, exact install, live endpoint and representative command
  before claiming a working flow. No credentials, writes or integrations beyond
  the verified contract. Show command states without invented output data.
- **Change/exception:** README existence is not npm publication. Page-design
  authority does not extend to provisioning a service or publishing a package.

## MKT-D13 — Dropdown choices must be usable, not merely mounted

- **Scope:** search/onboarding dropdowns, short viewports and long lists.
- **Requirement:** choices stay visible, unclipped and pointer/keyboard selectable
  in constrained viewports; focus, scroll and stacking must support selection.
- **Founder evidence/status:** bug-derived requirement from explicit screenshots
  in the originating discussion; product repair remains with its existing owner.
- **Enforcement:** test open → navigate/scroll → select → resulting state, with
  real bounding boxes, hit testing and short-viewport/long-list cases. DOM
  presence alone cannot pass. Use the exact CI selector and meaningful changed-
  behavior coverage; preserve existing test gates.
- **Change/exception:** no layout fix may bypass identity/security checks or
  steal the separately owned Spotify repair lane.

## MKT-D14 — Identity and connection states must tell the truth

- **Scope:** profile claim/reconnect behavior and its UI labels.
- **Requirement:** distinguish same-owner already-connected/reconnect from
  another owner's “Already claimed”. Verify durable identity/binding, make
  same-owner repeats idempotent and deny different-owner claims. Matching a
  display name is never an ownership bypass.
- **Founder evidence/status:** bug-derived requirement from the originating
  screenshots; no authorization to skip account binding or takeover protection.
- **Enforcement:** state-transition and failure-path tests for same owner,
  different owner, missing/conflicting binding and repeat request. Verify final
  persisted state and truthful labels through the real CI runner/coverage path.
- **Change/exception:** product copy cannot repair an incorrect authorization
  decision. Keep existing auth/Spotify ownership; no fabricated identity evidence.

## Review and enforcement handoff

For each changed surface, identify applicable IDs, acceptance status, source
owner, real render and runtime evidence. Use existing context, component,
palette, accessibility and behavior gates where they actually measure the rule.
Keep editorial/taste review explicitly human/rendered. Never create tests that
only assert these document phrases and call them behavior or taste coverage.

This register changes instructions only. It does not implement a header, theme,
clipboard, locale, CLI, dropdown or connection fix. Current artifact status and
the Pen transport checkpoint belong in the separate operator handback, not in
the normative rules. Unrelated speech that the user retracted as belonging to
another task supplies no design requirement or action authority here.

## MKT-D15 — Marketing control size and arrow semantics

- **Scope:** marketing buttons, footer preferences, editorial links, CLI and visibility studies.
- **Requirement:** diagonal up-right arrows denote a new browsing context; straight-right arrows denote same-context navigation. Copy uses copy/check; in-page actions use appropriate non-navigation symbols. External destinations do not automatically require a new window. Match footer controls to the canonical button visible size and hit target; smaller marketing labels are a scoped proposal, not an app-wide change.
- **Founder evidence/status:** explicit arrow and canonical footer-size direction on 2026-09-13; smaller button text was tentative.
- **Enforcement:** inspect actual target/rel and action behavior, verify keyboard/clipboard states, and compare controls against g3IC1 geometry rather than zoomed screenshots. The recorded g3IC1 master contract is 28px visible within a 44px target; verify the current saved source and retain accessible targets. New-context links require the appropriate safe rel contract.
- **Change/exception:** the September 14 native Pen PM handoff permits ONLY
  `FoiAh.height = 32` instance overrides for `C5ui5`, `D8v2A`, `UB1Gg`,
  `KiTH6` under public-profile shell `kh2z3`, and `uM8hY` under release shell
  `VrRlg`, retaining 44px hit areas and the 28px `g3IC1` master. This is a
  scoped exception, not a global button-size change, broader master/padding/
  header authorization, or proof the edit was saved. Communicate actual
  navigation behavior consistently; do not impose a new-context destination
  merely to justify an icon. Re-evaluate scoped label size after rendered comparison.
