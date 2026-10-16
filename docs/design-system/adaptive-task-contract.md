# Adaptive task interaction contract

Source contract for [JOV-8348](https://linear.app/jovie/issue/JOV-8348).
This bounded implementation qualifies Jovie link-confirmation semantics. It does
not certify the cross-product migration. Remaining qualification is tracked in
[JOV-8518](https://linear.app/jovie/issue/JOV-8518).

## Composition and ownership

Keep AppShellFrame's existing content slots, persistent composer, AI SDK stream,
canonical atoms and product domain APIs. Welcome/insight/recent work,
conversation, structured task, acknowledged result and next task share the main
area. Dedicated Work/library/table views remain. Account scope, task identity,
draft, selection and composer survive temporary task transitions. Product
taxonomy, navigation, data, permissions and native titlebars stay product-owned.

The shared `@jovie/ui/lib/task-persistence` contract is presentation only. It
does not accept generated code, URLs, components, actions or authority. Domain
adapters validate complete receipts before passing them to presentation. Partial
tool streams and successful proposal generation never acknowledge a mutation.
Voice, touch and keyboard must dispatch the same validated domain action.

## State and acknowledgement

| State | Meaning and permitted next step |
| --- | --- |
| Draft/proposal | Inspect/edit approved inputs, submit or cancel. |
| Submitting | Keep inputs and controls mounted; suppress duplicate dispatch. |
| Acknowledgement unknown | Preserve input. Reconcile the existing request before another mutation. |
| Persisted locally | Device durability only; identify remote sync as pending. |
| Persisted remotely | A validated remote receipt identifies scope, request, object and revision. |
| Failed | Known rejection; retain input and the safe recovery action. |
| Canceled | Explain cancellation and retain a deliberate return path. |
| Succeeded | Product completion milestone after acknowledgement at its claimed durability. |

`TaskPersistenceReceipt` binds `scopeId`, `requestId`, `objectId`, positive integer
`revision`, and `durability`. `resolveTaskPersistence` requires the requested
scope/request and valid object/revision; local and remote remain distinct. It is
not an authorization check. Existing domain APIs own authorization, expected
revisions, receipt storage and effect deduplication. Neither a persisted chat
transcript nor an `OperationReceipt` for tool execution establishes a business
save. There is no new action store or transaction service.

## First consumer: confirm a social link

The real ToolPartsRenderer mounts ChatLinkConfirmationCard. Add confirms the
already-reviewed URL in one activation. The canonical Button handles pointer,
touch and keyboard. Proposal, submitting, failed, unknown/checking, remote
acknowledgement, canceled/undo and preview keep the URL and controls mounted.
The status slot is reserved; controls keep their width and focus. Completion is
an immediate text/check equivalent under reduced motion. An atomic polite
announcement describes the result. A preview explicitly says no link was saved.

The card sends a stable tool-call-derived request identity to the existing
`/api/chat/confirm-link` API. The existing profile/platform advisory lock and
ownership check precede receipt lookup. The existing transactional audit row
stores the normalized input, optional expected version, result and remote
receipt with the link write. A same-input replay returns the original receipt
without another link update, version increment, sync or audit. Reusing that
identity with changed input is rejected. Authorization is checked again on
replay. Existing revision conflicts continue to reject stale supplied versions.

Transport/decode/cancellation/server failures are acknowledgement unknown.
Check save uses the same identity with `reconcile: true`; this path reads under
the same lock and cannot execute a mutation. A failed check remains unknown.
Only an explicit absent-receipt result permits Add again with the original
identity. Known HTTP rejections retain the proposal. A matching remote receipt
is required for completion and the profile preview update. Account/proposal
changes reset local state; old callbacks cannot complete the new card.

This slice does not claim proposal-time revision binding for every tool, voice
dispatch coverage, authenticated remote replay or LYB component adoption. Those
acceptance receipts remain in JOV-8518 and the parent. Storybook API fixtures
prove mounted source behavior, not database commits or a production build.

## Adopt-first evidence and revisit

The [September14–October14 primary-source comparison](https://linear.app/jovie/document/adaptive-ui-adopt-first-receipt-september14-october14-14925bd636c2)
records licenses/maintenance, hosting/data/credentials, compatibility,
accessibility, streaming/actions, cost, exit and revisit conditions. Its dated
October13 json-render release and September14 RevenueCat update are distinct
from older foundation documents and undated current notices. This source change
adds no provider, credential, sensor, location collection or paid dependency.
The [October14 coordination contract](https://linear.app/jovie/document/jovie-lyb-adaptive-task-surface-contract-and-pencode-variance-1dce15a034b0)
is historical design evidence, not a current runtime certificate.

**Ship now:** deterministic owned cards over current AI SDK/domain infrastructure.
**Re-evaluate when:** two observed consumers need dynamic composition beyond
those cards, or upstream schema/version/hosting costs materially change.
**Then:** qualify a pinned json-render adapter against adversarial partial
streams/actions, accessibility, latency and cost. Retain domain receipts and
owned components as the exit boundary. Do not replace transport or authority.

## Pen/code variance ledger

| Surface | Evidence | Qualification |
| --- | --- | --- |
| New Chat master hkkdJ | October14 handoff: candidate metadata; corrupted screenshot | No fresh Pen inspection, save/readback or pixel parity claimed. |
| Shell/sidebar/native geometry | Existing JOV-7878/JOV-8017 owners | No competing shell change in this slice. |
| Link task | Current Button, ChatToolSurface, validated receipt adapter | Source tests and mounted fixtures; Pen master mapping not established. |
| LYB web import | October14 placeholder observation | No current consumer checkout/import or adoption proof. JOV-8518 retains qualification. |

The pinned JovieKit snapshot importer remains PR21655's owned path. Extending
it to a web subset requires actual LYB Node/React/token/CSS/checksum/update and
rollback proof; copying TSX or assuming private `@jovie/ui` is published does
not satisfy adoption. Source, hosted checks, merge, deployed identity and
observed runtime are separate receipts. Keep the commissioning parent open
until both products' mounted and deployed evidence exists.
