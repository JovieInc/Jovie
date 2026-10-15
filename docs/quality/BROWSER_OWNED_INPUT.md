# Browser-owned input assurance (JOV-7846)

This adds a runtime dimension to JOV-7713 screen assurance and the JOV-6061
[platform authority](../../apps/web/lib/platform/supported-platforms.ts).
The canonical [matrix](../../scripts/invariants/browser-owned-input-matrix.json)
joins environment/device classes to critical journeys and semantic roles. It is
not a second platform or certification registry. Version floors and ownership
remain with JOV-6061. Samsung Internet and Instagram support are explicitly
UNKNOWN until their supported boundaries and available affordances are verified.

`browserInputVerdict` reports every cell as PASS, UNKNOWN or BLOCKED. Missing
records are UNKNOWN; failing, stale, synthetic or incomplete records are BLOCKED.
Unknown platform support cannot pass even if a record claims success.
Both the existing screen certification gate and nightly screen-audit ledger
consume these findings. Web auth is now gated rather than excluded; native auth
ownership stays with its native suite. A resting screenshot or synthetic fill
cannot satisfy the browser-owned input dimension. Device evidence does not
bypass the existing immutable GitHub artifact/provenance resolver.

## Deterministic layer

Run the Node detector fixtures with:

```sh
node --test scripts/invariants/browser-owned-input.test.mjs
```

The existing fast structural lane includes this suite. Playwright detector
fixtures use the existing noauth configuration (no application server needed):

```sh
E2E_SKIP_WEB_SERVER=1 E2E_SKIP_SEED=1 E2E_SKIP_WARMUP=1 \
  pnpm --filter @jovie/web exec playwright test tests/e2e/browser-owned-input.spec.ts \
  --config=playwright.config.noauth.ts --project=chromium
```

These prove the detector and DOM/geometry adapter, not physical-device behavior.
The seven original deliberate-red classes and additional lifecycle failures are
asserted with named findings. Numerical geometry measures visual/layout viewport
heights and offsets. Each run must independently measure app validation/state,
submission count, stable input identity, scroll restoration, anchor movement,
safe-area/sheet clipping and viewport oscillation; unmeasured is not a pass.

## Bounded real-device script

Use a controlled test identity, test email/phone and Stripe test mode where
applicable. Do not record personal credentials, real OTPs or other users' data.
For each matrix journey/environment/device cell:

1. Open the exact deployment. Record the full source SHA, served `/api/version`
   build identity resolved to the same full SHA, URL, timestamp, device model,
   OS/browser versions, keyboard/manager versions and operator. A release label
   or matching-looking page is insufficient.
2. Start a screen recording showing browser chrome. Capture screenshots at each
   ordered phase: before-focus, focused, platform-ui-visible, value-filled,
   keyboard-dismissed, submit, back-retry. Capture real `visualViewport` and layout
   viewport samples during resize/scroll events, including offsetTop and scrollY.
3. Check type/name/label/autocomplete/inputmode for every declared semantic role,
   including hidden/offscreen duplicates. Verify non-credential fields do not
   attract credential classification. For passkeys, exercise the real chooser;
   conditional input uses the `username webauthn` contract. A button-only chooser
   requires route-specific evidence before changing applicability.
4. Invoke every applicable matrix scenario from the actual browser/OS UI. On iOS
   select Contacts/email and Hide My Email; exercise QuickType, Keychain and
   Chrome's Google manager separately. On Android use Gboard/Google manager and
   Back to dismiss. Exercise OTP and saved credentials on their respective auth
   steps. On desktop include native suggestions and 1Password. If an affordance
   is unavailable, record UNKNOWN/BLOCKED with the observed reason.
5. With suggestions active, scroll the focused input and submit action into view;
   confirm neither is obscured, trapped under sticky navigation, clipped or
   displaced by double safe-area padding. Exercise orientation, browser toolbar
   collapse/expand, tablet resize, and desktop zoom/text scaling as named by the
   cell. Measure vh/dvh/svh through open/close; reject oscillation or jumps.
6. Select a suggested value. Compare validation and submitted payload with typed
   input, check stable focus/input node and scroll, then dismiss, submit once,
   navigate back/forward and retry. Confirm exactly one submission, preserved
   values, sane scroll/focus restoration and no hydration/runtime errors.
7. Attach recording and all phase screenshots with HTTPS artifact references and
   SHA-256 digests. Populate `browserOwnedInput` in the existing screen-proof
   measurements consumed by `screen-proof-emit.mjs`; it preserves that dimension
   inside the immutable producer artifact. It is never a standalone certificate.

A device record uses schema `jovie.browser-owned-input/v1`, a `records` array and
`cellId` from `inputCells(screenId)`. Each record carries headSha, servedBuildSha,
kind `real-device`, status PASS, URL, buildIdentity artifact, provenance above, recording/screenshots
`{url,digest}`, scenario verdicts, viewportUnits verdicts and ordered samples.
The executable validator and its fixture builders specify the field contract.
An offscreen action needs an `actionProbe` with its rect, viewport and hit test
after scrolling; a claimed reachable boolean cannot override failing geometry.
Keep screenshots/recordings in the controlled evidence store; references alone
remain untrusted until the containing producer artifact passes the resolver.

## Historical escape and completion

The October 4 Get Updates report is registered in the existing
[UI escape corpus](../screenshots/ui-escape-holdout/browser-owned-input.json). Its original capture is not attached to the issue; capture replay is
BLOCKED, rather than substituting a synthetic screenshot. The deterministic
fixtures replay the reported failure classes only. Device commissioning and
original-capture recovery remain explicit acceptance debt tracked by
[JOV-8387](https://linear.app/jovie/issue/JOV-8387).

Ship now: the reusable matrix, detectors and fail-closed certification dimension.
Re-evaluate when: physical-device records and the original capture are available.
Then: run the script against the deployed exact build, replay the capture, and
record certification through the existing lifecycle; source merge is not proof.
