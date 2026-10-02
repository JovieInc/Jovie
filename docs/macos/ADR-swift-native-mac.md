# ADR: A native Mac experience on a shared Swift core

> Status: Accepted direction; native product implementation and release parity are not certified.
> Direction recorded: 2026-09-27. Migration sequence refined: 2026-10-02.
> Epic: [JOV-6747](https://linear.app/jovie/issue/JOV-6747).
> Foundation receipt: [JOV-7500](https://linear.app/jovie/issue/JOV-7500).
> Supersedes the Electron-only prohibition in [the historical Mac ADR](../MACOS_SWIFT_CONTROL_ADR.md) and proposed `JOV-INV-013`.

## Decision

EVENT: Tim's Swift-native Mac direction, first recorded in
[#18958](https://github.com/JovieInc/Jovie/pull/18958), is the target.
The 2026-10-02 Mac audit sets the order: ship the targeted Electron fixes first,
then build the core Mac experience with SwiftUI/AppKit on a shared Swift client
core extracted from iOS. Electron remains the shipped Mac app until a tested,
reversible native cutover passes the acceptance below.

Opening, typing, switching conversations, and navigating should feel local.
Network reconciliation must not block editing or navigation. Native technology
alone does not prove that outcome; source changes, builds, fixtures, real
sessions, and measured production workloads are different evidence.

## Current owners and target boundaries

| Area | Current owner | Target or constraint |
| --- | --- | --- |
| Shipped Mac app | `apps/desktop` Electron | Keep shipping reliability, performance, auth, and update fixes until cutover. |
| iOS product | `apps/ios/Jovie` | Reuse its client behavior; do not assume every desktop action already has native parity. |
| Shared Swift client core | Existing iOS clients, models, and repositories | Extract into `apps/ios/Packages/JovieKit` in bounded slices consumed by real clients. |
| Native Mac product | Planned sibling `apps/ios/JovieMac` target | SwiftUI shell, AppKit where useful, shared client contracts; not a second backend or agent-policy implementation. |
| Operator shipping menu | `apps/macos/MenuMonitor` | Remains an accessory, separate from product UI. |
| Occasional complex web screens | Existing web surfaces | Isolated, on-demand WebKit views with explicit ownership and exit criteria. |

These target paths are architectural destinations, not evidence that a native
product target or complete shared package has landed. Do not rename the iOS tree
or create another repository to start this migration. The deprecated standalone
Swift Ovie implementation is read-only by policy, not the product foundation. Ovie can become a surface of the
one native Mac product without reviving that deprecated implementation.

Share transport, models, cache, conversation state, session boundaries, and
canonical action semantics. Keep UIKit/AppKit integrations behind platform
interfaces. Reuse `JovieTheme` and existing design-system owners; do not fork
Mac tokens or atoms. Platform shells and layouts can differ.

## Delivery sequence and acceptance

Independent bounded foundations may proceed in parallel while earlier runtime
acceptance remains open; completing one slice does not certify another stage.

| Stage | Ship | Evidence to complete this stage |
| --- | --- | --- |
| 1. Improve the shipped app | Validated client navigation, incremental transcript derivation, conservative work-state reload/update guards, useful launch/resource evidence, and small native affordances. | Behavioral regressions plus representative packaged Mac observations. Source-level expected gains stay separate from measured gains. |
| 2. Extract the shared core | Move existing iOS transport/model/stream/cache/state behavior into shared Swift code, one bounded consumer at a time. Preserve cancellation, optimistic messages, pagination, duplicate-send protection, and late-response isolation. | Both consumers use the same implementation; meaningful client tests retain those behaviors. A decoder extraction is a foundation slice, not native chat parity. |
| 3. Build one native chat path | Launch → cached conversation → type → send → stream → cancel/retry → switch conversation → resume after sleep. Native shell/sidebar, composer, transcript, and common tool/action cards belong in this slice. | Real authenticated sessions; draft/focus/selection/paste/undo/accessibility checks; bounded transcript rendering and incremental active-message updates; authorization and action-confirmation contracts preserved. |
| 4. Certify distribution and parity | Complete required file/capture/dictation, menus/notifications, recovery, and channel/update behavior. Register any web long tail. | Signed/notarized installed builds, production auth, update and rollback drills, feature/interaction parity, and comparable performance evidence. |
| 5. Cut over reversibly | Migrate users and sessions through a supported release path, retain rollback, then retire Electron. | Named release owner accepts the parity/signing/update/rollback receipts. Retire `apps/desktop` and its release machinery only after the rollback/compatibility window is explicitly closed. |

For the shell, evaluate SwiftUI `NavigationSplitView`. For serious composer
editing, evaluate AppKit `NSTextView` embedded in SwiftUI. These are starting
points, not proof of interaction quality. Transcript rows need stable identity,
bounded mounting, cached completed-message formatting, and incremental streaming
updates; do not port full-history work onto every token.

A session owns streaming, uploads, and pending actions; a view observes them.
Hiding or replacing a view must not cancel work accidentally. Hidden, minimized,
unfocused, and sleep/wake states need separate tests. On return, reconcile once.

## Authentication and release requirements

Reuse the canonical native auth/session contracts and system authentication
services. Preserve flow binding, PKCE verification, expiry, cancellation, replay
protection, origin/return-target validation, secure token storage, sign-out, and
recovery. Do not assume the draft passkey prototype or fixture launch proves an
authenticated session. Signed-app capabilities and endpoint behavior need
separate evidence; [JOV-6748](https://linear.app/jovie/issue/JOV-6748) tracks the
signing foundation.

Developer ID with notarization and an updater such as Sparkle is a candidate
release path, not a deployed capability. Select and prove signing, channel
identity, authenticated updates, install/session migration, and rollback before
cutover. Do not assume a final Electron release can silently install a different
native app or that bundle identifiers/entitlements are interchangeable.

Measure the installed production apps with normal GPU behavior and comparable
20/200/2,000-message conversations, tool results, and attachments. Include launch
to editable/focused composer (with user/auth delay labeled), typing, switching,
foreground/background CPU and memory, streaming, and sleep/wake. A splash,
provider mount, simulator build, or fixture is not usable-chat evidence.

## Web bridge register

WebKit is for isolated screens loaded on demand, not a permanent hosted chat
shell. A bridge must specify the route, reason, owner, auth/navigation boundary,
and a Linear exit issue with a review date. Revisit each row at parity review;
keep a screen on web only through an explicit product decision. A registered
bridge does not silently establish feature, security, or performance parity.

No native product bridges are approved by this direction-only change.

| Route/surface | Reason | Owner | Auth/navigation boundary | Exit issue and review date |
| --- | --- | --- | --- | --- |

## Provenance and evidence limits

This direction layer is adapted from Tim White's commit
[`3dde45bbe4d5fc657ace0bf551f0d99f7ad53674`](https://github.com/JovieInc/Jovie/commit/3dde45bbe4d5fc657ace0bf551f0d99f7ad53674)
in [#18958](https://github.com/JovieInc/Jovie/pull/18958), originally co-authored
with Claude Opus 5.5. The original ADR and local spike observations remain in that
commit as historical evidence. Its unmerged runtime/auth prototype, theme, AASA,
project, and CI changes are not adopted by this extraction. Its reported unsigned
passkey failure and lack of a proven real sign-in remain unresolved by this ADR.
No build, runtime, native parity, or measured speed claim follows from these docs.

The earlier Electron-only ADR remains a dated investigation. Proposed control
slugs remain proposed; this does not adopt rows into `canon/invariants.jsonl`.
[JOV-6760](https://linear.app/jovie/issue/JOV-6760) retains broader canon adoption.

**Ship now:** this direction and the independently qualified Electron fixes and
shared-core slices. **Re-evaluate when:** the complete native chat path has real
Mac interaction, security, and performance receipts. **Then:** complete the
parity/signing/update/rollback checklist before scheduling Electron retirement.
