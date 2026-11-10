# Interaction measurement envelope v1

`jovie.interaction-measurement/v1` is an additive, duration-only capture
envelope. It retains the existing interaction sample names. It is not the
budget evaluator's summary report and carries no pass verdict. JOV-8717 owns
coverage/evaluation; JOV-8726 owns native scenario qualification. Consumers must
partition by measurement version, fixture, source/build and refresh profile.

The adjacent [JSON schema](interaction-measurement-envelope-v1.schema.json)
defines the shared envelope. Native capture uses
`ios-layout-display-link-v1`. There are at most 20 attempts, ten foreground
seconds per attempt, and one active attempt. `runIndex` identifies a sample;
`attempt` identifies retries. `warmup` attempts remain separate. `sampleCount`
counts distinct scored run indices, including incomplete runs; `attemptCount`
counts all attempts. Neither count establishes success. Missing metrics have
an explicit `unavailableMetrics` reason and must not become zero or pass.

| Native field | Checkpoint |
| --- | --- |
| `firstFeedbackMs` | Send handler to the optimistic user row's layout followed by a displayed-frame callback. |
| `dataReadyMs` | Send handler to the first nonempty assistant model content applied by ChatRepository. This is model availability, not presentation or server latency. |
| `usableStateMs` | Send handler to the completed reply row's layout followed by a displayed-frame callback. |
| `renderToInteractiveMs` | Reply checkpoint to a subsequent TextField edit reaching its binding and passing layout plus a displayed-frame callback. Earlier edits or an enabled field alone do not qualify. |
| `foregroundDurationMs` | Bounded foreground observation duration, ending on completion, cancellation, timeout or resignation. |
| `foregroundFrameCount` | Display-link callbacks within the attempt, excluding pre-event frames. |
| `droppedFrameCount` | Sum of missed callback intervals, relative to the previous callback's `targetTimestamp - timestamp` forecast. One lost refresh is detected at both 60 and 120 Hz. |
| `maxFrameIntervalMs` | Largest observed adjacent displayed-frame interval. Unavailable without two frames. |

The adapter uses [UIView layout callbacks](https://developer.apple.com/documentation/uikit/uiview/layoutsubviews())
and [CADisplayLink](https://developer.apple.com/documentation/quartzcore/cadisplaylink).
Markers must remain mounted, nonempty, visible through their ancestors and
intersect the foreground window and clipping ancestors. The link's
[`timestamp`](https://developer.apple.com/documentation/quartzcore/cadisplaylink/timestamp)
must be strictly later than marker layout; a future target timestamp is never
treated as an observed presentation. Capture uses `CACurrentMediaTime` for
event/handler times and records the callback observation time for durations.
This proves a presentation opportunity, not pixel-level compositor proof.
Missed callback intervals are a foreground scheduling proxy, not GPU frame
instrumentation; variable refresh can change cadence. Do not compare refresh
profiles or pool this with XCTest hitch metrics or browser measurements.

Native controls, collector, markers and export are all `#if DEBUG`. Automatic
capture additionally requires the resolved `-ui-testing-chat` launch mode and
`JOVIE_IOS_CHAT_MEASUREMENT=1`; live-auth modes cannot opt in. Source SHA comes
from the existing baked `Configuration.local.plist` provenance, build number
from the app bundle, maximum refresh from the device. Invalid/missing provenance
disables capture. No caller-supplied identity or content is exported.

Completed/incomplete attempts overwrite one fixed `Caches/chat-measurement.json`
file on a serial utility queue. Export has no endpoint, Sentry event, credentials,
session/account identifiers, messages, recordings, URLs, wall-clock dates or
absolute monotonic timestamps. Tests may also encode the same envelope directly.
Backgrounding and navigation invalidate the link, deadline and observer; stale
generations cannot complete the next attempt. Export is asynchronous: a harness
must wait for the file to contain its expected attempt before collecting it.

Scoped checks: `pnpm run ios:lint` and `pnpm run ios:test --
-only-testing:JovieTests/ObservabilityTests
-only-testing:JovieTests/ChatRepositoryTests -enableCodeCoverage YES` on macOS.
Clock tests prove collector behavior; they do not certify device budgets or the
fixture's network behavior. No visible controls or layout geometry are added.
