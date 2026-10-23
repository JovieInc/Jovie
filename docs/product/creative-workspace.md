# Creative workspace: capture, shape, review, prepare

Refs JOV-8648. Design and architecture first draft, checked 2026-10-21.
Audience: dot coordinating the creative-workspace research and the existing
Work, Content OS, capture, review, launch and Tasks implementation owners.
Load this document when planning a bridge between those systems.

## Recommendation and boundaries

Make one creative work easier to improve: capture → confirm its home → shape a
draft → point at an objection → compare → keep → approve → prepare a launch.
Music is the first product hypothesis; an episode exercises the same contracts.
An evolving demo may collect lyrics, melody, beatbox, references and direction
without pretending every take has already become a coherent song.

The customer-facing destination is **Work** at `/app/library`; Library remains
the implementation namespace. Follow the
[Identity / Work ontology](identity-work-ontology.md) and
[existing content graph](library-content-graph-and-artist-rules.md). A work item
is creative output, not a new name for a project, task or workspace. Reuse each
source's canonical ID; the shared context is a projection over those sources.

This delivers a planning artifact. It adds no route, UI, database, provider,
generation, spend, upload or publication. It does not change artist-profile
positioning, the $12 launch scope, or LYB and first-revenue priority. Coordinate
with [Bubblegum Factory](https://linear.app/jovie/project/bubblegum-factory-audio-first-content-and-launches-58e55186a62f).
The October 19 Linear draft is prior design evidence; this source audit corrects
its Library naming and distinguishes existing foundations from missing bridges.

**Bottleneck hypothesis:** moving between private scripts, recordings, review
and launch loses context and requires repeated manual matching. The issue and
project record that friction; no measured time-saving result exists yet.
Measure active production minutes, transfers, time to find the correct take,
routing corrections, first-draft acceptance and rework on one private package.
Reliability failures are counted separately from taste and speed.

**Ship now:** this minimal contract and a private prototype plan.
**Re-evaluate when:** the package has a frozen manual baseline and six observed
human edits, or any reliability/authority violation appears.
**Then:** implement only the repeatedly costly bridge under its existing owner;
stop expansion if the bridge adds work or violates the contract. Six edits are
a usefulness trial, not enough samples for a latency or loss-rate claim.

## Source audit and ownership

Inspected repository base: `3813f4d514d`. Links below are local source evidence,
not hosted CI, deployed UI or device observations. On 2026-10-23 those cited
paths were rechecked against `76bf0a17f95`: they still resolve, Tiptap remains
3.32.0 without UniqueID, voice capture still returns a transcript without an
original file, vlog storage remains `local_only_no_upload` with a fresh script
UUID, and the launch registry is still in memory. That recheck is source
evidence only. The 2026-10-21 GBrain lookup failed with a connection refusal.
A 2026-10-23 keyword search for JOV-8648 returned no page. No prior memory
was treated as proof.
Linear issue/project descriptions and related ownership were refreshed on
2026-10-21. Status badges do not certify the end-to-end workflow.

| Capability and classification | Canonical implementation and observed limit | Implementation owner retained |
| --- | --- | --- |
| Work context and browsing; differentiating product logic | [LibraryPageClient](../../apps/web/app/app/(shell)/library/LibraryPageClient.tsx) projects lifecycle and documents; [LibrarySurface](../../apps/web/app/app/(shell)/library/LibrarySurface.tsx) consumes the shared inspector. [Graph types](../../apps/web/lib/library/graph-types.ts) already have suggested/active/rejected/removed relationships. No generic Work database needed. | [JOV-7752](https://linear.app/jovie/issue/JOV-7752), JOV-2931 and [JOV-7473](https://linear.app/jovie/issue/JOV-7473); Tim White |
| Document editing and revision approval; differentiating product logic | [CreatorDocumentsWorkspace](../../apps/web/app/app/(shell)/library/CreatorDocumentsWorkspace.tsx) uses RichTextEditor, explicit saves and expected-revision conflict handling. [Schema](../../apps/web/lib/db/schema/creator-documents.ts) has content hashes, exact-revision approvals and capture handoffs. | [JOV-5173](https://linear.app/jovie/issue/JOV-5173); Tim White |
| Script generation and locks; necessary integration | [Content OS](../content-os/README.md) stores hash-chained CLI revisions with stable spoken-block IDs. A digest-preserving import into private Library revisions is a proposed bridge, not an existing common revision store. | [JOV-8128](https://linear.app/jovie/issue/JOV-8128), JOV-8127; parent unassigned, preserve its coordination |
| Original capture and ingest; necessary integration | [VoiceCaptureService](../../apps/ios/Jovie/Core/VoiceCaptureService.swift) sends buffers to Speech and returns transcript/latency, without an original-audio file. [Vlog session storage](../../apps/ios/Jovie/Features/AppShell/VlogTeleprompterCore.swift) creates a fresh script UUID and says `local_only_no_upload`. [Mac ingest](../../apps/macos/media-ingest/ingest.ts) verifies copied bytes/checksums; this is not a mobile upload bridge. | [JOV-5075](https://linear.app/jovie/issue/JOV-5075), [JOV-5370](https://linear.app/jovie/issue/JOV-5370); Tim White; missing bridge qualification JOV-8757 |
| Localized review and playable sequence; differentiating product logic | Existing player and [inspector scope](../../apps/web/lib/library/work-inspector-read-model.ts) are reuse seams. Durable cross-media anchors, dependency invalidation and a frozen playback manifest still need qualification. | [JOV-4670](https://linear.app/jovie/issue/JOV-4670), [JOV-4671](https://linear.app/jovie/issue/JOV-4671); Tim White |
| Rights and generated versions; necessary integration | [Artist-rule engine](../../apps/web/lib/artist-rules/engine.ts) supports confirmed rules and scoped exceptions; it is not a complete creative rights ledger. Do not infer clearance from a URL or successful upload. | [JOV-4825](https://linear.app/jovie/issue/JOV-4825), [JOV-4826](https://linear.app/jovie/issue/JOV-4826); unassigned, no reassignment here |
| Launch and assignments; differentiating product logic | [Launch contract](../../apps/web/lib/launch/index.ts) includes exact source revisions, claims, permissions and external receipts; its in-memory store does not prove a persisted live service. [Work actions](../../apps/web/lib/library/work-actions.ts) separate public page, private sharing and per-work launch summaries. [Playbooks](../../apps/web/lib/tasks/playbooks/registry.ts) remain canonical. | [JOV-7404](https://linear.app/jovie/issue/JOV-7404), [JOV-7472](https://linear.app/jovie/issue/JOV-7472), [JOV-7762](https://linear.app/jovie/issue/JOV-7762); Tim White; [JOV-7837](https://linear.app/jovie/issue/JOV-7837) unassigned |

New cross-system qualification is tracked in
[JOV-8757](https://linear.app/jovie/issue/JOV-8757), a low-priority candidate
under this planning issue. It coordinates gaps; it does not replace these owners
or turn their completed foundations into unverified claims of full delivery.

## Minimal IA and shell integration

Keep the shared Home / Identity / Work / Audience navigation. Tasks retains its
current name and existing entry points. Capture is an action in the existing
composer/action entry, not a fifth destination or another persistent composer.
The shared [ChatInput](../../apps/web/components/jovie/components/ChatInput.tsx)
owns input chrome. A selection can supply a frozen work/revision/anchor context
to that input; current code does not prove this full context contract yet.

| Surface | Job and smallest native change | Removed or avoided complexity |
| --- | --- | --- |
| Work list | Keep current list/grid/table views, lifecycle and composable type/release filters. Recent, Needs review and Unfiled can be query presets when needed. Unfiled means no confirmed relationship, not a second asset store. | No new Library destination, song database, permanent taxonomy tabs or mandatory collection setup. No new saved-view manager for the pilot. |
| Overview / Files inspector | Overview shows selected output, playable version, one next action and actual public state. Files shows populated attachments with role and availability metadata. Reuse InspectorShell and one Attach entry, including drop/paste. | Preserve two tabs; do not add Lyrics, Voice, References, History or Launch tabs, empty media buckets, or artist-wide stats on one song. |
| Focused document or player | Open the actual document or selected media. Script is editable prose; optional playback stays secondary while writing. Select text/time/frame to reveal local feedback. | No parallel editor application, permanent timeline, provider panel or second chat rail. |
| Capture sheet / native overlay | One Record/Stop affordance, elapsed time, actual input state, destination suggestion, stable save status. Confirm classification/home after stop. | No pre-record taxonomy wizard. Recording must work before transcription/classification. |
| Launch brief | Open only for a work with a launch or an explicit preparation request. Show audience, outcome, one CTA, date, canonical destination, required deliverables, exact approvals and Task links. | No new launch engine or blank press-kit panel on every private demo. |

IA disposition: **no new surface in this PR**. Proposed UI work integrates and
consolidates into existing surfaces. At implementation, a Capture action must
replace or specialize an existing input action rather than append a duplicate.
Reject any proposed route/tab whose job fits selection-local disclosure.

Source-counted complexity: Work has four lifecycle choices (All plus three
stages), three view modes, and two inspector tabs. This document changes none
of them: 4→4, 3→3, 2→2, with zero added controls, routes, panels, groups or
scroll footprint. Proposed review defaults to one candidate plus at most two
collapsed alternatives; optional details may grow locally only after selection.
Do not represent these source counts as measurements of the mounted app.

Design target: [DESIGN.md](../../DESIGN.md), existing
[Work inspector stories](../../apps/web/components/features/library/WorkInspector.stories.tsx),
and the Library UX Audit Pen frames identified in the content-graph canon.
The current Work inspector uses InspectorShell; the release-detail sidebar's
Overview / Links / Tasks is a different scope and must not be renamed blindly.
No live Pen canvas or mounted app was available for this document audit.
JOV-8757 must reconcile source, Pen ownership and mounted state before UI edits.
No Pen mutation or screenshot approval is claimed.

Dials: `DESIGN_VARIANCE=low`, `MOTION_INTENSITY=functional`,
`VISUAL_DENSITY=medium`. Use existing System B tokens, Inter, shared controls,
uncropped artwork and native mobile conventions. Content leads; no card wall.

## Key interaction flows

### Capture an idea without choosing the wrong song

1. Tap Capture from any context. Request microphone access if necessary;
   speech permission is separate and never a prerequisite for recording audio.
   Show Starting until real samples reach the local recorder. Show Recording
   only after the first successful local audio write; an animated meter alone
   is not proof. There is no network dependency on starting or local saving.
2. Preserve source audio continuously in account-scoped durable local storage.
   Record the capture ID, owner identity, audio format/timebase and recoverable
   chunk journal. Do not normalize, denoise, trim or replace original bytes.
   Transcription and musical interpretation are optional derivatives.
3. Stop seals audio and its journal, computes/verifies the original checksum and
   acknowledges **Saved on this device** only after durable readback. Upload
   queued, Uploading and Available across devices are later independent facts.
   Cancellation keeps the take recoverable; Discard explicitly deletes it under
   the retention/deletion policy. A failed save offers recovery, never success.
4. Propose lyric / melody / beatbox / spoken direction / reference segments
   against original time ranges. Play before classifying; allow split, merge,
   reclassification and reassignment without altering the audio. Silence and
   melody remain valid captures even when no words are recognized.
5. Show a suggestion such as “Attach to Afterglow?” with title and identifying
   context. The suggestion is not an attachment. Explicit **Attach to Afterglow**
   confirms a frozen canonical target; choosing a target while recording also
   requires this final confirmation. If ambiguous, dismissed or offline, keep
   Unfiled. Never create a new song because two titles resemble each other.
6. Confirm server-side owner/target access again at attach/upload completion.
   A selected song change, account switch or late model response cannot change
   that target. Retry with the same owner + capture + operation idempotency key.
   A timeout reconciles existing storage/relationship receipts before retry.

Record/Stop uses the two-activation frequent-action budget. Attachment adds a
named **ambiguity/safety** step; explicit routing is worth that extra action.
Uploading an Unfiled original to the user's already authorized private storage
does not imply an attachment or sharing grant. Revoked auth queues it locally.
On sign-out, retain protected pending originals for that account; another login
cannot list, play, transcribe, dedupe against or upload them as its own.

### Write a clean script

Open the existing private document, type directly, select a paragraph, and use
ordinary editing undo. The shared editor owns formatting and selection. Save
creates a new canonical revision; Saving / Saved / Unsaved changes / Conflict
are truthful, distinct states. Preserve caret, scroll and unsaved input on
failure. An automatic-save implementation is not assumed by this plan.

Voice input has two explicit modes: Dictate text or Record a take. Dictation
inserts editable text; it must not imply original-audio retention. A take keeps
audio and optional transcript separate. Feedback such as “shorten this opening”
binds document ID, exact revision/hash, stable block ID and selected text range.
Return a bounded diff. Keep locked lines and their claim references byte-exact.
Save and review required evidence before approving the resulting revision.

Importing a Content OS draft must retain its project/revision digest, global
canon digest, spoken B IDs, claim references and lock state. Keep CLI history as
provenance and map each import to a canonical document revision; never pretend
the CLI revision number is a Library revision ID. Reimport of the same digest is
idempotent. If representation changes whitespace or block mapping, stop and show
the diff; do not silently weaken exact locks. This is JOV-8757 qualification
with the JOV-8128/5173 owners, not an implemented importer.

### Improve an exact part of a playable work

Pause on a frame, mark an audio interval or select a paragraph. State the
objection and optionally attach an authorized reference. The composer shows a
compact context chip identifying that exact selection, with an inspectable path
to version and timebase. A work switch keeps the request bound to its original
context; the user explicitly starts a new request to target the new selection.

Present one recommended interpretation with declared assumptions and at most two
collapsed alternatives. Deterministic operations may offer a preview; a generated
candidate requires separately authorized execution and a visible cost/scope before
the request. Compare against the base in the same text/player position. **Keep**
changes the selected draft, **Approve version** records an editorial decision,
and **Publish** remains a separate action with independent authority. A failed or
unknown job leaves the last selected version intact.

Example: add a melody take and lyric revision to a demo, then ask for an acapella
opening or a different bassline. Preserve approved vocal bytes only if actual
independent sources and a supported operation exist. Separated stems are
estimated derivatives, never recovered original stems. If a model regenerates
the whole mix, describe a full-mix candidate and affected approved regions before
execution. Do not label an approved chorus unchanged from a prompt instruction.
Decline the operation when its preservation requirement cannot be met; the user
may explicitly accept a separate broader candidate without replacing the lock.
Local edit quality, musical consistency and stem artifacts remain experiments
under JOV-3320/8757, with no generation authorized by this document.

### Prepare a thin launch

An artist release uses the existing release/track IDs and smart-link destination;
a Jovie capability uses its existing capability/merge revision and availability
evidence. Both use the current LaunchSourceRef and Tasks/playbook contracts.
Deliverables reference canonical files and immutable versions. A Task has an
accountable human owner and may have an agent assignee; assignment grants no
extra account, spend or send authority. No agent integration is invented here.
Prepared → approved → queued → provider accepted → delivered require the receipts
their labels imply. A draft press kit is not a live generation service, and an
internal state mutation is not delivery or a measured launch outcome.

## Progressive disclosure, state and input contract

| Trigger | Show now | Reveal only when needed |
| --- | --- | --- |
| Browse or open | Content, title, quiet source/review/availability status, one next action | Versions, ownership/provenance and detailed metadata through existing inspector/menu |
| Select text/frame/audio | One local refinement input and exact target chip | Precise range/timebase, reference, comparison and alternatives |
| Ask what changed | Before/after and observed result | Provider receipt, actual operation parameters, cost and verifier evidence |
| Choose Never/Always | Plain-language rule and explicit scope | Exclusions, examples, conflict and broader future-work scope |
| Missing rights, input or authority | Concrete blocker beside the attempted action | Evidence and remediation path; never hide a consequential blocker in metadata |

Do not ask users to configure a provider or taxonomy before making a useful
private draft. Do not collapse a required consent/cost/destination choice.
No missing fact is filled with invented certainty. Playback reads existing
bytes or declared placeholders; it never starts generation or purchases output.

| State | User-visible behavior and recovery | Stability/accessibility requirement |
| --- | --- | --- |
| Loading | Stable media/document skeleton; existing draft remains available where safe | Reserve player/status geometry; no async movement of Record, Stop or Keep |
| Empty / no data | One useful Capture, Write or Attach action for the current context | No permanent empty media buckets; labeled keyboard/touch control |
| Recording / saving / uploading | Actual state and next available action | Announce transitions, not every meter tick; elapsed time is not color-only |
| Offline / interrupted | Saved locally or incomplete/recovered, with Retry when possible | Keep inputs and media; do not dismiss a take because transcription failed |
| Failure / partial / unknown | Name failed operation, retained material and safe retry/reconcile action | Error/status slot stays local; focus remains on initiating control |
| Conflict / stale anchor | Compare current revision or confirm a proposed remap | Never silently overwrite, rebase or move feedback |
| Permission denied / signed out | Explain unavailable action and account-safe recovery | No automatic new owner, upload, settings redirect or provider fallback |
| Populated / long / dense | Scan titles and status; full title/details remain inspectable | Scroll within owner, wrap prose, no horizontal document overflow |
| Compact / zoom / keyboard | Sheet or focused content replaces competing panes | 390px and desktop fixtures, text scaling, 44px hit containers, named focusable controls |

Web uses native text selection, Tab/Enter/Space, standard editing shortcuts and
visible focus. Escape closes local disclosure and returns focus to its trigger;
it never discards an unsaved draft. Range feedback has typed start/end controls
as an alternative to dragging. VoiceOver/TalkBack-style semantics, iOS Dynamic
Type and hardware-keyboard behavior need native validation; no new Android app
is proposed. Reduced motion removes nonessential animation. Follow WCAG 2.2 AA,
non-color status, 4.5:1 text contrast and existing semantic tokens. These are
acceptance requirements, not claims of rendered accessibility proof.

## Version, dependency and authority contract

The following describes missing references/records to add only where an existing
owner cannot already express the contract. It is not a migration or a parallel
universal asset/job system. Hashes establish integrity, never access rights.

Concrete root rule: use an existing release/recording when present; before that,
use the existing private creator-document ID for the idea. An evolving song can
reference that idea, a script/lyric document revision, original melody/beatbox
takes, reference versions and launch deliverables without allocating a second
song ID. When a release exists, add its confirmed relationship and retain the
original IDs. The graph's current edge kinds do not yet express every proposed
take/reference role; JOV-8757 must qualify a narrow owner-reviewed extension,
not force those roles into `release_context` or invent another generic graph.

| Record | Minimum immutable binding / mutable pointer |
| --- | --- |
| Work context | Owner profile + typed source/canonical ID; existing release/document/Task/launch links. Suggested relationships need confirmation. Planned placeholders have no fabricated file ID. |
| Capture and segments | Owner + capture ID + original asset/version/checksum + timebase. Editable segment revision holds ranges and classification; confirmed target relationship is separate from a suggestion. |
| Asset version | Original/derived parent IDs, exact bytes/hash, origin, permitted uses and evidence. No overwrite of originals. Selection is a mutable pointer with compare-and-swap against its expected prior value. |
| Edit request / result | Exact base revision/manifest digest, anchor, requested operation, references, protected properties, rule snapshot, authority, idempotency key and actual job/cost receipt. Result does not apply itself. |
| Playback / render manifest | Exact document revision, asset versions, measured or planned intervals, placeholders, recipe/renderer version and render output digest when one exists. Playback can be a sequence of files without claiming a rendered movie. |
| Review decision | Actor/time + exact immutable revision or manifest/output digest + editorial scope + decision. Historical approval remains on its version when selection changes. |
| Activity | Actor/time, request/base/output IDs, attempted operation, observed result, evidence/verifier, costs and inverse action reference when supported. |

Keep the axes independent:

| Axis | Values / meaning |
| --- | --- |
| Source origin and completeness | planned, captured, generated, reference; a playable placeholder remains planned. A reference is not permission to sample or reproduce. |
| Availability | local, queued, transferring, remotely verified, missing, deleted; verified remote storage requires readback/checksum, not HTTP acceptance alone. |
| Execution | queued, running, succeeded, failed, cancelled, unknown; unknown paid requests reconcile before retry. |
| Editorial review | unreviewed, changes requested, approved, approval revoked; always version-bound. Kept draft and approved output are distinct. |
| Access | current authorized owner/membership/grants, independently enforced for originals, derivatives, previews, thumbnails and transcripts. |
| Publication | private/prepared, queued, provider accepted, delivered, withdrawn/retracted as supported by the canonical launch owner; never inferred from playback or approval. |

Anchors use exact version plus timebase: video frame index/presentation timestamp
and optional normalized spatial coordinates; audio start/end samples with sample
rate; text block ID, range, quote and surrounding context. Variable-frame-rate
video cannot rely on guessed constant FPS. Text quote matching alone cannot
resolve repeated paragraphs. On change, keep feedback on its historical source;
mark stale or propose an explicit remap. A remap creates a recorded new binding.

Dependency example: script r4 + take A1 + music M1 → preview P1 → approved export
E1 → launch deliverable D1. Changing take A1 to A2 creates a new candidate and
marks only dependent current preview/export/deliverable pointers **Out of date**.
An unrelated approved artwork version is unaffected. Approval of E1 remains
historically true; it does not approve E2. Renaming a title does not alter audio
bytes, but invalidates exports that embed the title. A rule change invalidates
pending jobs whose protected behavior changed, not all historical approvals.

Before apply/export/publish, recheck current access, exact base/selected manifest,
locks, dependency/rights snapshot and authority. Commit pointer updates atomically
only if expected inputs still match. A late result remains an inspectable candidate
when stale; it never overwrites a newer draft. Revoked rights block new controlled
exports and identify affected descendants. Already published bytes remain exact
historical output; withdrawal/replacement is an explicit separate action, and
cannot retrieve copies downloaded elsewhere.

## Truthful history, undo and taste

Activity distinguishes Requested, Attempted, Candidate created and Verified.
“Generated a candidate for trash-can removal; review needed” is valid when that
is all the receipt proves. “Removed trash can” requires evidence that the target
is absent, collateral changes were checked and a named verifier/method supported
that conclusion. Before/after images alone are not that verification. Never
invent a sequence of precise edits from one opaque model call. Show failure,
uncertainty and unsupported operations alongside successful operations.

Document undo restores local edits through the editor's normal history; a saved
restoration appends a revision. Asset/manifest Undo appends a selection-restoration
event; it preserves prior bytes/history and checks for concurrent changes before
moving the pointer. Undoing an already paid generation changes selection, not its
charge. For coupled model edits, undo the whole candidate. A selective reversal
needs independent operations or a new explicitly authorized candidate. Publication
is not undone by local version undo. Authorized deletion covers caches/derivatives
and prevents undo from resurrecting deleted media; retain only permitted audit
tombstones, with no original or sensitive transcript in public logs.

Start visual work from the actual
[White Space rules](../../apps/web/lib/services/retouching/styles/white-space.md)
and global Content OS identity references. Preserve natural texture, identity,
wardrobe and composition under that recipe; identifying marks, people and logos
are protected. Removing dust is not consent to change skin identity or remove a
person. A scene-object edit needs a supported explicit safe scope outside the
default retouch; taste preferences cannot override protected rules.

An objection edits the current candidate only. **Never do this / Always do this**
opens a proposed rule with visible instruction, examples, exclusions and scope:

| Scope shown to the user | Existing owner / effect |
| --- | --- |
| This asset (default) | Existing item scope + canonical source ID; exact revision may be an example, while the rule applies only to this asset's future edits |
| This project | Existing release scope when the context is a release; for a non-release package lacking a canonical project scope, keep asset scope and explain the unavailable option rather than create an invented project ID |
| Future work for this artist/brand | Explicit artist-scoped rule confirmation, including which identity and action family; never a default from one rejected candidate |

Reuse [stored scopes](../../apps/web/lib/artist-rules/types.ts) and confirmed-rule
precedence in the existing engine. The stored rule shape and pure engine shape
differ; their adapter and package scope need qualification in JOV-8757. Preserve
truth/safety/law/platform/contract constraints over preferences. Conflicting
preferences surface a small choice for this operation; do not silently enlarge
scope. Review/edit/revoke rules through the existing artist-rule owner; revocation
affects future operations. “Always” is neither retroactive editing nor consent to
paid generation, training, sharing or publication.

Name every hard lock's protected property: exact text bytes, source audio bytes,
or rendered interval bytes. Musical feel, identity and vocal consistency are
perceptual review constraints. Reused vocal bytes do not guarantee an unchanged
mix or timing. Expose that consequence before a broader candidate is requested.

EVENT: voice ownership, provider-upload consent, cloning authority, reference
music rights, singing identity, generation spend and publication authority are
separate evidence. A narration license does not imply a singing identity grant;
a reference link does not clear composition or recording use. The private pilot
uses manual speech or already authorized existing generic narration. The
[current clone tool](../../apps/web/lib/ai/tools/voice-clone.ts) constructs a
simulated success ID while its provider call is commented out; it supplies no
usable provider evidence. Keep cloning unsupported in this workflow. Its repair
remains [JOV-2654](https://linear.app/jovie/issue/JOV-2654) and voice qualification
under JOV-8757, not a claim that a new clone path shipped here.

## Capture latency, recovery and failure evaluation

Proposed targets, to be qualified by the capture owner on physical devices:

| Measurement | Proposed acceptance and fixture |
| --- | --- |
| Warm tap → first locally written audio sample | p95 ≤1s with microphone permission already granted; 100 attempts per device class, including offline |
| Stop → durable-save acknowledgment | p95 ≤2s for 60s and 10min captures, 100 attempts per duration/device class; checksum/readback included, all failures retained in denominator |
| Cold launch and first permission | Report separately from warm start, including user permission time; no invented result or inherited warm budget |
| Long capture and recovery | 30min boundary fixture plus a 60min stress recording; report save/reopen latency, first/last sample loss and recoverable tail explicitly |
| Upload / transcription / classification | Separate queues and p50/p95/n, network/device/format/size labels; never on the critical local-capture path |

Use a reference signal with known first/last markers; compare decoded sample
counts and gaps, not only transcript text. Journal a durable captured-through
position; target ≤1s unacknowledged tail with periodic chunks, subject to device
qualification. An interrupted unsealed tail is labeled incomplete. Any previously
acknowledged audio loss fails even if all latency targets pass. Verify restart
recovery and full sealed-original checksum before acknowledging the full take.

Run each injected failure at least five times per supported device/OS cohort,
including the oldest supported physical iPhone and a current iPhone, with exact
build, OS, storage, microphone route and network recorded. Do not report pooled
percentiles that conceal a failing cohort. Percentiles cover attempted eligible
captures; failures/timeouts are reported alongside latency, never dropped.

| Injection / adversary | Required observable outcome |
| --- | --- |
| Airplane mode, packet loss, upload timeout, expired auth | Capture locally; visible queued recovery; reconcile uncertain upload before retry; no duplicate asset/attachment |
| Phone call, suspension, microphone disconnect/switch, permission revocation | Seal/recover prior durable audio, show interruption and explicit Resume/new take; no dead Recording label or silent gap |
| OS termination and user force-quit, then reopen | Recover acknowledged originals/journal; reconcile transfers on next launch; no promise that force-quit uploads continue |
| Disk full before or during capture, corrupt journal, failed rename/readback | No false saved badge; retain recoverable bytes, identify incomplete range, offer safe retry/export recovery |
| Double tap, repeated Stop, cancel/reopen, repeated attach | One capture per accepted start and one relationship per confirmed operation; explicit discard only |
| Switch selected work during classification; two songs with same title | Suggestion stays bound to original capture; no attachment until target confirmation; current selection cannot redirect completion |
| Switch accounts, forged IDs, revoked membership, guessed media URL | Deny all cross-account content and metadata; local pending take remains with original owner; no cross-tenant dedupe disclosure |
| Empty speech, pure melody, beatbox, silent tail | Original remains playable and recoverable; transcript failure never deletes the take |

Implementation must register added stages in the existing
[stage manifest/event contract](../metrics/STAGE_EVENTS.md), emit timestamped
`jovie-stage-event/v1` receipts and report p50/p95/n. Proposed boundaries are
capture-start, local-seal, upload-readback and classification-ready; the
implementation owner registers valid IDs before emitting them. Use monotonic
device clocks for local durations and UTC receipt times for reconciliation.
No stage is added by this documentation PR. Telemetry contains opaque IDs and
timings, never audio, transcript, filenames or private preference examples.

## One private prototype and incremental slices

Candidate package: the existing
[Content OS dogfood revision 4](../content-os/dogfood/README.md), an episode draft
for Tim's feedback, not Tim-approved content. Use one private working copy and
one approved owner account. Preserve original JSONL/hash chain and the B2 lock;
do not regenerate the checked-in fixture or expose private recordings in Git.
Dot coordinates the pilot in JOV-8757 after LYB/first-revenue work permits it.
This is a plan, not an executed episode or permission to record Tim's voice.

Before execution, record the package owner, exact script digest, permitted input
rights, local/private storage, permitted tools, participants and a **$0 generation
spend cap**. Use supplied/manual authorized narration, one reference image if
cleared, two takes and explicit silent/visual placeholders. No cloning, new
provider upload, music sampling, paid retry, outbound message or publication.
If input authority is absent, retain placeholders and report the missing input.

| Slice and owner | Concrete prototype output | Exit evidence and stop condition |
| --- | --- | --- |
| 0. Manual package; JOV-8757 with script owners | Inventory, private file IDs/checksums, canonical document revision mapping worksheet, selected takes and a simple ordered playback manifest with labeled placeholders | Save/reopen/play the full intended sequence with an existing player; exact script/asset references resolve. Record baseline active minutes, transfers and take-finding time. Stop on missing originals/authority; no custom renderer. |
| 1. Script bridge; JOV-8128/5173 | Digest-preserving import and stable block/lock map only if pilot friction justifies it | Same import twice yields one mapping; B2 and claims remain exact; stale write rejected; private cross-account read denied. No new editor. |
| 2. Capture bridge; JOV-8757 with ingest/native owners | Durable original + confirmed Work attachment + resumable private transfer before segmentation automation | Physical-device latency/recovery matrix above; checksum, first/last samples and account isolation. Stop on any lost acknowledgment or wrong target. |
| 3. One review family; JOV-4670/4671 with document owners | Start with one paragraph diff, selected-version restore and one asset-scoped preference. Manually assembled alternatives suffice for pilot. | Keep and Approve bind exact versions; stale anchor, concurrent edit and dependency change are rejected or visible. No frame-edit quality claim from a text-only trial. |
| 4. Launch preparation; JOV-7404/7472/7762/7837 | Existing brief, smart-link or capability destination reference, canonical deliverables and agent-assignable Task draft | Exact review bindings and required rights remain visible; unavailable inputs say Needs input. Private preparation only, no delivery/first-revenue claim. |

Use the same package and task order for baseline and candidate. For six human
edits, record intended objection, selected region, candidate kept/rejected,
unrelated drift, number of alternatives inspected and reasons. Proposed benefit
threshold: lower median active time and transfers without lower human acceptance
or any reliability violation; retain raw observations and sample size rather
than declare statistical significance. Re-evaluate the threshold after baseline.
Repeated friction determines the next slice; no full build is commissioned.

## Adversarial review and open decisions

Author-run adversarial desk review, 2026-10-21. These are design findings and
specified mitigations, not independent review, executed failure tests or model
quality evidence. Prior project reviews and any pending Opus review are not
reclassified as this draft's validation. Existing CI/review owners independently
assess the exact planning diff after publication.

| Attack on the design | Resolution in this draft / required proof |
| --- | --- |
| “Start recording” can succeed while speech drops the song | Independent durable audio before recognition; pure music and speech failure fixtures |
| A plausible match silently chooses the wrong Afterglow | Suggestions never attach; final explicit target confirmation and account/target recheck |
| Approve r4, then a late result replaces it | Exact base/manifest comparison and atomic selection; stale candidate remains separate |
| Locked vocal reused but mix/chorus changes | Name protected bytes/property; prohibit perceptual preservation claims without review |
| An opaque visual edit claims a precisely removed object | Candidate language unless named verifier and collateral checks support the operation |
| One objection becomes global taste or new spend consent | Asset default, explicit scope confirmation, separate rights/cost/publication authority |
| Undo resurrects a deleted take or implies a refund | Tombstone/retention enforcement; inverse selection is distinct from provider charge or withdrawal |
| Reference transcript/filename tells the agent to publish | Treat reference content as data, never authority; scoped action authorization still required |
| Same checksum leaks another artist's unreleased take | Account-scoped access and dedupe; guessed-ID and derivative/thumbnail denial tests |
| “Launch ready” mistakes an in-memory contract for a live service | Source audit states the limit; require persisted exact output and external receipts for later claims |

Unresolved taste decisions use defaults; they do not block this planning PR:

| Decision | Default now | Re-evaluate when / then; owner |
| --- | --- | --- |
| Music-first framing versus broad launch language | Work remains broad; first creative hypothesis is a song getting better, then released | After the private episode and first authorized song package, compare comprehension and reuse; dot/JOV-8757 with JOV-7404 |
| Gallery versus list for media-heavy context | Preserve current view modes and selection; no automatic gallery switch | Observe take-finding time in dense mixed media, then retain the faster chosen view; JOV-7752 |
| Playback while writing | Clean document with optional playback | Six edits expose repeated context loss, then test one compact existing-player arrangement; JOV-4670/8757 |
| How much variation is useful | One recommended interpretation, at most two collapsed alternatives | Six reviews show rejected first directions or wasted inspection, then adjust bounded choice count; JOV-8757 |

Explicit deferred scope and canonical tracking:

- Prototype execution, capture/script/rule adapters, physical-device proof and
  mounted/Pen reconciliation: JOV-8757, with the slice owners above.
- Generated versions/rights/rendering beyond manual playback: JOV-4825/4826 and
  JOV-4670/4671. No general NLE/DAW, realtime collaboration or stem-consistency
  guarantee is proposed; qualification decides whether any bounded need exists.
- Voice cloning/singing qualification: JOV-2654 and JOV-8757. Manual or previously
  authorized generic narration remains the fallback.
- Broad Photos ingestion: JOV-5370's owner; its local verified-copy foundation
  is not evidence of broad ingestion, auto-retouch or mobile cloud sync.
- Short-video concept experiment and later generation: [JOV-3320](https://linear.app/jovie/issue/JOV-3320).
- External publication and first measured artist/Jovie launch: JOV-7404/7472;
  Tasks execution integration: JOV-7837. This plan adds no task or launch engine.

## Capability sourcing and evidence limits

Apply [the canonical sourcing policy](../../canon/ENGINEERING.md#capability-sourcing-and-ia-integration).
Reuse the installed editor and native audio/file/transfer stack. No custom
commodity mechanism, dependency, fork, license purchase or provider selection
is authorized here. Requirements and missing evidence remain in JOV-8648's
existing workpad and PR `planningDecisions`, bound to the final exact head and
trusted policy digest. Proposed bridges remain **research-ready** until behavior,
compatibility and independent review evidence exist; structural completeness of
that receipt is not a promotion or runtime claim.

Official sources checked 2026-10-21, with bounded conclusions:

| Source | What it supports / what remains unproven |
| --- | --- |
| [Apple AVAudioRecorder](https://developer.apple.com/documentation/avfaudio/avaudiorecorder) | Native recording to a file is available. Reuse AVFoundation; select recorder versus existing engine/file sink only after device tests. The API alone proves no crash durability or latency. |
| [Apple background transfers](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background) and [background configuration](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)) | Background upload support uses files; user force-quit cancels transfers and prevents automatic relaunch. Reconcile on reopen; never promise unconditional sync. |
| [Tiptap extension index](https://tiptap.dev/docs/editor/extensions/overview) and [UniqueID](https://tiptap.dev/docs/editor/extensions/functionality/uniqueid) | A first-party node-ID extension exists. Repository editor packages are pinned to 3.32.0; UniqueID is not declared in the inspected web manifest. JOV-8757 must verify matching-version/license/schema and split/paste/undo behavior before adoption; do not implement bespoke IDs on an assumption that no extension exists. |
| [Frame.io comments](https://help.frame.io/en/articles/9090684-getting-started-how-do-i-leave-comments) | Frame, range and spatial anchors support the interaction precedent. This is not a Frame.io integration or a reason to copy its whole application. The earlier versioning link failed retrieval, so no version-stack capability claim relies on it. |

Design checklist at specification level: state coverage, stable layout ownership,
keyboard/native input paths, contrast requirements, overflow, media availability,
long/localized text, reduced motion and authority blockers are specified above.
UI evidence: not applicable to this Markdown-only change; component/file evidence
is linked. Rendered contrast, browser compatibility, localization, assistive
technology and device performance remain **unverified**, tracked in JOV-8757.
Documentation parity/link/context checks cannot prove those outcomes.
