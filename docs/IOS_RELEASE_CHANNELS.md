# iOS Release Channels (JOV-7534)

iOS follows the company release-channel model with Apple-specific mechanics.
The canonical path is:

```
merged → certified → release-eligible → uploaded → processed
       → distributed to dogfood → installed/running → dogfood-verified
       → promoted/submitted to stable → released → installed/running
```

Every stage needs a durable receipt. A green workflow, an issue state, a build
number, or an upload event never implies a later stage succeeded.

## Channels

| Channel | Rail | Owner of the install surface |
| - | - | - |
| Dogfood / Beta | Internal TestFlight group | Apple (App Store Connect) |
| Stable | Public App Store release | Apple (App Review + storefront) |

There is no in-app Stable/Beta toggle: an App Store build cannot convert itself
into a TestFlight build. Settings only reports provenance (see below) and
exposes an admin-only link to Apple's own TestFlight enrollment surface.

## Stage → evidence map

| Stage | Current evidence | Source |
| - | - | - |
| merged / certified | Exact `CI` success on `main` | `ci.yml` |
| release-eligible | `Production Verified` job + `production-generation-verified-<sha>` marker artifact | `production-controller.yml` |
| uploaded | `testflight-upload-verified` artifact bound to the exact run/attempt/job | `ios-testflight.yml` `record-upload` |
| processed | `upload_to_testflight` waits for ASC processing (`skip_waiting_for_build_processing: false`, `TESTFLIGHT_PROCESSING_TIMEOUT`) before the upload job can succeed | `fastlane/Fastfile` `beta` |
| distributed to dogfood | `distribute_external: false` distributes to internal testers; ASC internal-group state is observable via JOV-6738 signals | `fastlane/Fastfile` `beta` |
| installed/running / dogfood-verified | Device + dogfood runs (`apps/ios/scripts/dogfood-ios.sh`, `report.json` schema `jovie-ios-dogfood/v1`); in-app provenance row shows channel + commit | `docs/IOS_DOGFOOD.md`, Settings "App" section |
| submitted stable / App Review / released | Explicit operator action; observed via JOV-6738 ASC review-state signals | App Store Connect |

Timestamps and the earliest missing stage across this path are a Summer/Ovi
observability surface (JOV-6738), not a workflow concern. A TestFlight stall
must surface with evidence and never gate unrelated web/Mac/customer releases.

## Provenance inside the app

`AppBuildInfo` (`apps/ios/Jovie/Features/Settings/SettingsView.swift`) reports:

- **Channel**: derived from `Bundle.appStoreReceiptURL` — `receipt` ⇒ App
  Store/Stable, `sandboxReceipt` ⇒ TestFlight/Beta. DEBUG establishes
  Development; missing/unrecognized receipts in non-debug builds mean Unknown.
  Development and Unknown imply no published channel. This is read-only
  provenance; it cannot change the install channel.
- **Version / Build**: `CFBundleShortVersionString` / `CFBundleVersion`.
- **Commit** (admin surface only): the `GitCommit` key written into
  `Configuration.local.plist` by `apps/ios/scripts/write-configuration.sh`.
  The `beta` lane binds it to the
  authorized `RELEASE_SHA`; local builds fall back to worktree HEAD.
- **Open TestFlight**: shown only to the admin surface
  (`showsWorkspaceSwitch`) when the running build is not already on the
  TestFlight rail. It opens `https://testflight.apple.com` — Apple's
  enrollment/install flow. The install source remains Apple-controlled.

## Stable promotion rules

- Promotion reuses the exact tested build whenever Apple's submission model
  allows; never rebuild merely to call it stable.
- App Review and public release state are explicit and independently
  observable — phased rollout is a policy tool, not release correctness.
- Stable submission/release never blocks continued dogfood delivery.

## Related work

- JOV-6240 — internal TestFlight release foundation (`ios-testflight.yml`,
  `fastlane ios beta`, `testflight-upload-verified` markers).
- JOV-6738 — Summer signal for App Store Connect reviews / TestFlight
  processing state.
- `docs/IOS_DOGFOOD.md` — deterministic dogfood driver and `report.json`.
- `docs/DESKTOP_DOGFOOD.md` — the macOS sibling rail.
