# Scoped action contracts — JOV-8018

Source audit: 2026-10-15, baseline `292063d67befedb9e0fb0ea8bf57dd3b4ba071bb`.
GBrain: `gbrain-unavailable` (localhost:7801 refused connection). Independent
implementation using existing primitives; no external reference code incorporated.

This is the first bounded implementation slice. It does not certify the full
cross-entry commissioning acceptance. Required continuation is tracked in
[JOV-8388](https://linear.app/jovie/issue/JOV-8388) (authoritative execution and
remaining inventory) and [JOV-8389](https://linear.app/jovie/issue/JOV-8389) (voice,
preview preservation and exact-build certification).

## Existing owners and admitted mappings

The action owner remains [commands/registry.ts](../../apps/web/lib/commands/registry.ts).
Its six matching navigation definitions now own their existing keyboard sequence
metadata. [keyboard-shortcuts.ts](../../apps/web/lib/keyboard-shortcuts.ts) projects
identity, label, destination and hint for help, sidebar hints and the sequential
handler. It does not define those six actions again. Cmd-K retains its contextual
numbered aliases; a shell sequence is suppressed inside its search editor.

| Existing command | Existing sequence ID | Shell sequence | Menu/keyboard target owner |
| --- | --- | --- | --- |
| `go-calendar` | `nav-calendar` | G then L | `APP_ROUTES.CALENDAR` |
| `go-home` | `nav-dashboard` | G then D | `APP_ROUTES.DASHBOARD` |
| `go-links` | `nav-links` | G then K | `APP_ROUTES.LINKS` |
| `go-settings` | `nav-settings` | G then S | `APP_ROUTES.SETTINGS` |
| `go-tour-dates` | `nav-tour-dates` | G then O | `APP_ROUTES.TOUR_DATES` |
| `go-work` | `nav-releases` | G then R | `PRODUCT_ONTOLOGY.work.canonicalRoute` |

These are navigation effects with no write confirmation or execution receipt.
The authenticated destination retains its existing authoritative checks. Selecting
a route is not completion of a creator write. Keyboard applicability is the active
shell with an unclaimed event and unchanged origin. The menu uses its current
selection adapter and the same command href. Profile settings, contacts and a
conversation are distinct from the profile panel, audience filter and chats list;
their existing sequence bindings are preserved rather than silently remapped.

| Entry point / surface | Existing owner | Handler, applicability and proof |
| --- | --- | --- |
| Menu / Search | `CommandPalette`, `CmdKPalette`, `SharedCommandPalette` | Menu commit uses `router.push(command.href)`; Work pointer, menu Enter and shell sequence parity is tested in `SharedCommandPalette.test.tsx`. Main-content presentation is preserved. |
| Shell keyboard/help | `KEYBOARD_SHORTCUTS`, `useSequentialShortcuts` | Required bindings retain named owners. `keyboard-shortcuts.test.ts` checks command resolution, names, targets and collisions; `useSequentialShortcuts.scope.test.tsx` exercises the real router adapter. |
| Chat slash / tool UI | `commands/registry.ts`, `SlashCommandMenu`, `tool-schemas.ts`, `tool-ui-registry.ts` | Skills remain opt-in by surface. `HIDDEN_TOOLS` and every existing reason are unchanged. Existing slash and account-tool tests remain applicable; this slice does not expand tool exposure. |
| Ovie review decisions | `FounderReviewStack`, `FounderReviewRecorder` | Focused review-control arrows use the existing recorder/canonical callbacks. Pending active cards and IME input cannot invoke them. Visible decision buttons remain available. Tests exercise callbacks and absence of receipt creation. |
| Creator opportunity decisions | `OpportunityCardStack` | Existing focused control, swipe and visible buttons retain existing action callbacks. IME arrows are ignored; pending action/revision coverage is preserved. These bindings are not installed across unrelated creator workflows. |
| Ovie voice comments | `FounderReviewRecorder`, `FounderReviewRecorderControls` | Current source has Cmd/Ctrl+Shift+M capture. Hold-space capture and target-safe lifecycle certification remain JOV-8389; this slice does not claim that acceptance. |
| Desktop menus | `apps/desktop/src/main.ts` | Settings uses Command/Ctrl+,; native roles own close/quit. Embedded web uses the web handlers. No native renderer or new native action definitions introduced. |
| Siri / App Intents | `JovieAppIntents.swift`, `IntentNavigationStore.swift`, `AppShellIntentNavigation.swift` | Existing open-chat, queued-message and capture handoffs remain native. OS return/foreground/unlock is not completion. Native tests and running-build certification are not supplied by this slice. |
| Voice proposals / MCP / CLI | `packages/action-contracts`, existing authenticated executors | Preserve existing effect levels, channels, envelope and six statuses. Fleet-only generic invoke does not establish a creator dispatcher. JOV-8388 owns the next consequential-action parity slice. |

Active PR audit: open PR #21791 (sidebar dock) does not touch these keyboard,
command or review owners; #21790 owns alert-dialog motion. Neither was changed.
JOV-1827/JOV-1791 are completed prior art, not reopened work.

## Input precedence and context

The focused editor/control, transient dialog/menu/listbox, or media/composite
control owns its keys before the shell. The existing `isShellShortcutSuppressed`
helper recognizes claimed events, repeats, composing events and IME key code 229,
shadow-root editor paths, native/ARIA transients, media controls and hidden/inert
ancestors. Sidebar and right-rail callers consume the same strengthened helper.

A pending shell sequence belongs to its original event target. Focus, pointer,
composition, window blur, disable/unmount, protected input, extra modifiers and
Escape cancel it. Ambiguous active sequences fail closed instead of choosing the
first registered binding. Escape itself remains unconsumed so the nearest
transient owner can dismiss it. No draft, selection or private-content retention
store was introduced. Completed Search preservation/lock contracts (JOV-7272)
remain in place; sibling-preview commissioning is JOV-8389.

## Verification boundary

The added tests fail against the original source, including an injected duplicate
Work sequence, composition events, stale sequence targets and pending decisions.
The original-source run produced 39 failing assertions; implementation files were
restored before the green run. Local Vitest coverage and Playwright component
fixtures are source/browser evidence, not server authorization, native runtime,
production deployment or JOV-7713 commissioning receipts. The browser fixture
mocks review API responses explicitly and uses the real keyboard and menu owners.

Ship now: one registry projection and focused-input safety, under the issue's
1,500-line review limit. Re-evaluate when: JOV-8388/JOV-8389 deliver their bounded
acceptance. Then: attach exact served-build assurance receipts for both products
through JOV-7710/JOV-7713 before claiming the commissioning outcome complete.
