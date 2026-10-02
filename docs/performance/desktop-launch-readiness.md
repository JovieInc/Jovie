# Desktop launch readiness evidence (JOV-7476)

The existing `app-booted` heartbeat means the React provider mounted. It still
owns the recovery watchdog. It does not establish authenticated chat, a loaded
conversation, or a usable composer.

The desktop now writes `desktop-launch-readiness.json` in Electron's `userData`
directory. On a normally installed production Mac this is
`~/Library/Application Support/Jovie/desktop-launch-readiness.json`. The file
contains the current process PID, Node performance time origin, packaged build
identity, and four separately named milestones:

| Field | Evidence |
| --- | --- |
| `nativeWindowReadyToShowMs` | Electron's first main-window `ready-to-show` event; this can be the local splash. |
| `reactMountedMs` | The existing React heartbeat from the live top-level chat frame. |
| `composerVisibleEditableAfterPaintOpportunityMs` | The chat owner reports that initial conversation loading has ended, the existing auth context is loaded and signed in, and the actual textarea is connected, enabled, writable, non-inert, CSS-visible (including opacity through Chromium visibility checks), and intersects the viewport after two animation-frame callbacks. Main also verifies the window is visible and not minimized. |
| `composerActuallyFocusedMs` | The same textarea is the active element in a focused document, and main verifies the window is focused. |

All elapsed values use the main process's `performance.now()` clock. Renderer
clock values, conversation text, account identifiers, and URLs are never stored.
Two animation-frame callbacks provide a paint opportunity; they do not prove
compositor presentation or input-to-paint latency. The initial native splash and
React heartbeat are not substitutes for either composer milestone.

Observation is passive: it does not move focus, type, send a message, perform a
new auth fetch, wait for a model response, enable debugging, or change GPU flags.
The current chat does not automatically focus the composer at startup. The
actual-focus duration can therefore include user delay, and must not be
reported as pure startup latency. Sign-in and time spent away from chat can
also contribute to these process-lifetime elapsed values. Readiness establishes
editable authenticated UI, not backend send authorization or network health.

Only the current main window's live committed top-level chat frame may report
composer readiness. Missing, detached, sibling, or untrusted frames fail closed.
Old binaries omit the optional bridge method. Reports are acknowledged locally
so a hidden-window rejection can retry when focus or visibility changes. Pending
paint callbacks are cancelled on unmount or eligibility changes and recheck the
DOM before reporting. Main stores each milestone once per process; reloads and
later focus events do not reset the clock or replace earlier evidence.

The receipt starts with null milestones and is replaced asynchronously and
atomically, at most five times per process. The latest receipt and a temporary
replacement file are the only retained files. Null means no observed milestone;
check the PID, process time origin, and build revision before using a receipt.
A failed write leaves no new proof and never blocks the interface.

To collect a receipt, quit Jovie normally, launch the installed production app
without extra flags, and reach authenticated chat. Observe focus separately.
After the composer is usable, inspect the file on the Mac:

```sh
cat "$HOME/Library/Application Support/Jovie/desktop-launch-readiness.json"
```

Save it with the representative production collector output from
`pnpm desktop:performance`. Match its PID and native
build to that collector run; report any sign-in, navigation, or manual focus
delay with the sample. The collector retains its explicit operator attestation;
a receipt does not silently upgrade that attestation into measured latency.

**Ship now:** this instrumentation plus deterministic frame, bridge, recorder,
and real composer component tests. **Re-evaluate when:**
[JOV-7463](https://linear.app/jovie/issue/JOV-7463) has real packaged Mac receipts
for 20, 200, and 2,000-message conversations with tool results and attachments.
**Then:** establish comparable launch, typing, conversation-switch, sleep/wake,
and resource budgets. The native Mac workload matrix remains unmeasured here;
this Linux source validation does not certify installed-app performance.

## Initial automatic maintenance (JOV-7511)

The main process queues initial automatic update checks, including their
automatic downloads, until two seconds after the accepted visible/editable
composer receipt. A 30-second deadline from first-window construction releases
the queue if sign-in, a non-chat route, hidden launch, recovery, offline startup,
or an older hosted client never supplies that receipt. These are bounded
scheduling defaults, not measured performance targets. A late readiness signal
cannot extend the deadline. Actual focus remains a separate observation.

Only already-due work is queued. The first web-build check normally sees the
local splash and does nothing; it still does nothing, and the existing
60-second poll keeps its original schedule. Updater checks retain their
30-minute interval. Wake/unlock events before startup release coalesce with
pending work; afterward they keep their current behavior and five-minute
updater wake floor. This launch gate does not claim fresh readiness on wake.

Updater configuration remains immediate. Explicit menu/IPC checks, downloads,
and restart actions bypass the queue. An explicit check also fulfills a queued
automatic check. Headless nightly updates retain their immediate check and
15-minute timeout. Quit cancels pending startup timers. Existing request-time
work-safety checks still decide whether a web reload or automatic update
installation may proceed.

[JOV-7511](https://linear.app/jovie/issue/JOV-7511) covers this scheduling slice.
Representative installed-Mac comparison remains under
[JOV-7463](https://linear.app/jovie/issue/JOV-7463); source tests establish timing
and lifecycle behavior, not a measured startup improvement.
