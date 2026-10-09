# Shared sidebar implementation contract — 2026-10-07

Owner: this chat, web stack `codex/shared-sidebar-browser-proof`, baseline `95c4afede3605e63a3dd9d2519ff843aae81f26e`.
Current native review draft: `545b383925854b8a1632fffe9b48087fe88f6e37`. Earlier3cdda evidence below is historical.
No Linear issue — ad-hoc. Design owner: Elevate the left rail sidebar.
Identity/table/connectors/library content is owned separately and excluded.

Implement the shared customer Jovie and private operator Ovie navigation contract,
with a calm dense shell and each runtime's existing native interaction behavior.

Adopt-first: compose existing Radix menus/popovers, SidebarProvider, shell motion,
registry adapters, updater and playback owners. No new infrastructure.

Primary task: open navigation, select an authorized destination in two activations.
Click, touch and keyboard are equivalent; hover is an accelerator. Floating access
does not persist a pin. Pin sidebar explicitly saves the desktop preference.

Context: opening/closing floating rail, More, Recent and nested menus must preserve
header/footer/account/trigger vertical coordinates, main bounds and scroll offsets.
Explicit pinning may change horizontal allocation. Escape closes deepest first,
restores the initiating control without scrolling; outside clicks retain their target.

States: pinned, collapsed, floating, mobile drawer; More closed/open, selected
overflow, long/short permitted registry; Recent closed/open, loading, empty, error,
cached, unread, active, running/failed, refreshed ordering; attention idle/update/
downloading/applying/failure/What's New; media inactive/mini/full/buffering/failure.
Account remains reachable in all combinations. Phone adaptation cannot save a
desktop collapse. Storage denial retains usable in-memory behavior.

Input: semantic controls, visible focus, Enter/Space, deepest Escape, touch hit areas,
fine-pointer intent and exit grace, reduced motion/transparency, zoom/text scaling.

Ship now: 244px live width, 44px header, 8px padding; Jovie four roots and existing
Ovie five primary IDs plus bounded More; compact Recent prototype for review.
Customer labels: Home / Profiles / Work / Audience. Profiles supersedes the older
Identity label under Tim's later direct voice instruction in coordinator chat
`01a11887-deee-7822-b72e-514397e2eb13`, human message
`01a118f6-5a3e-7951-a878-3d2b5997e4bd`. The presence registry ID and route remain.
GBrain decision `decisions/shared-sidebar-profiles-label-supersession-2026-10-07`
was written and its same-slug contents read back successfully.
Re-evaluate when: Tim reviews the rendered compact Recent treatment.
Then: retain or revise the treatment without removing full history access.

Verification: real Vitest CI selector plus changed-behavior coverage; Playwright
geometry/focus/rapid reversal and real registry/large-fixture checks; matched
source-attributed screenshots/traces. Web/Mac/iOS observed evidence is reported
separately. Local source and tests do not establish deployment or platform parity.

Private history uses the existing Summer web door only. Native Ovie offers a
user-initiated link to `/app/ov/chat`: its current mobile write handler requires a
creator conversation ID and cannot safely resume `summer-session:current`.
No customer-history fallback, backend adapter, or authority expansion is added.
The native handoff is a bounded compatibility limit, not full native Recent parity.

Final review heads and qualification: [review package](sidebar-review/qualification.md), [branch metadata](sidebar-review/branches.json). Large registries use at most 12 inline More pages plus existing scoped Find a page, preserving the current destination, full permitted registry and unrestricted valid pins. No-search callers preserve the full original list. Final native drawer file execution coverage is 1476/1743 lines (84.68%), distinct from changed helper policy coverage.

2026-10-08 current proof: web245ec38 passed18typechecks/fourCIcoverage shards2274passed12skipped/25browser; native3cdda passed22CI-discovered cases plus same-build largest-text capture1/1. Matching raw outputs and restored simulator state are in outputs/sidebar-review/qualification.json. Local fixture evidence does not establish physical/Mac/live/deployed acceptance.

2026-10-08 publication correction: all PRs must targetmain under executable guard. Only native and foundation are initialdraft candidates; laterweb layers remain unpublished until parentlanding/rebase/currentqualification. Formerfive-at-once draftproposal superseded; no authorization or publication inferred.

2026-10-08 current native supersession:545b3839 has690CI/35selected/6AASA/1same-buildOvie recording,zero skips/failures;coverage app34.51%,IntentNavigation98.21%,drawer92.59%. The existing mobile write path accepts optional creator conversation IDs and validates supplied IDs against creator-owned detail;it cannot resume the fixed private Summer current-session ID through that path. Existing private GET is bearer-capable at source level;native consumption/session acceptance remains open. No routes/backend interface change,protected in-app parity,zero-hitch/Mac/physical120Hz proof,publication or goal completion is inferred.
