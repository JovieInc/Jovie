# Mac app sign-in: browser handoff, fallbacks, and Touch ID

Owner surface: `apps/desktop` (Electron main + preload) and the hosted web
routes it loads (`/desktop-auth`, `/auth/start`, `/auth/callback`,
`/auth/native-return`, `/api/auth/native/*`). Rules: `.claude/rules/auth.md`,
`.claude/rules/macos.md`. Prior decision: gbrain
`engineering/jovie-macos-browser-signin-recovery-2026-09-06`.

## How sign-in works

1. The main process mints PKCE (S256 verifier + challenge) and a flow nonce,
   and shows the `/desktop-auth` handoff window.
2. "Continue In Browser" opens `/auth/start?client=electron&...` in the default
   browser with `shell.openExternal`.
3. After sign-in, `/auth/callback` stores a single-use exchange code and
   bounces through `/auth/native-return`, which fires
   `jovie://auth/complete?code&state&desktop_flow`.
4. The app binds the deep link to its pending flow nonce, then
   `/auth/native-complete` exchanges the code with the PKCE verifier for a
   one-time token, which sets the session cookie in the app.

## Return code fallback (deep-link independent)

When the `jovie://` link cannot reach the app, the return page also shows an
8-letter return code (RFC 8628 section 6.1 alphabet: consonants only, no
look-alikes). "Enter A Code" in the handoff takes it; the main process posts
it to `/api/auth/native/handback` with the pending flow nonce and PKCE
verifier and receives the same code/state pair the deep link carries. The
exchange still requires the verifier.

## Loopback return (RFC 8252 section 7.3)

The app also listens on 127.0.0.1 with an ephemeral port and advertises it as
`desktop_loopback` at `/auth/start`. `/auth/native-return` then hands the
same code/state/desktop_flow the deep link carries straight to the listener,
so same-device sign-in completes with zero typing even when `jovie://` is not
handled. The page uses a background fetch, not a top-level navigation: a
top-level navigation to a dead listener strands the cross-device path (a
sign-in finished on a phone has nothing on 127.0.0.1) on a browser error
page before the user can read the return code. Binding still requires the
pending flow nonce, and the exchange still requires the PKCE verifier — the
loopback carries no secret the deep link does not.

For the phone path the handoff shows the sign-in link as a QR code ("Scan
With Phone"), which pairs with the return code shown at the end of the
flow. The QR encodes only the public `/auth/start` URL; the verifier never
leaves the app.

Why a typed code and not a background poll: a poll keyed by the flow would let
anyone who crafts a sign-in link with their own verifier collect a victim's
session once the victim signs in (the device-code phishing pattern). With a
typed code the attacker needs both the verifier and the code the victim
reads. Stored values are sealed, keyed by a hash of the flow nonce, hold only
a hash of the return code, and are never consumed by a wrong verifier or a
typo. Older Mac builds do not declare `desktop_return_code=1` at
`/auth/start`, so their users never see a code they cannot use.

The same code also finishes a sign-in done on another device: copy the link,
open it on a phone or another computer, and type the code shown there.

Before each browser handoff the main process checks
`app.isDefaultProtocolClient` and reclaims `jovie://` if another copy of the
app, a stale install, or a translocated launch took it
(`auth-protocol-handler-repaired` security event).

## Benchmark (September 2026)

| Pattern | Who | Notes |
| --- | --- | --- |
| System browser + custom scheme return | Slack, Linear, Figma, Notion, Raycast, GitHub Desktop | Standard. All keep an in-app "open again" and a manual fallback. |
| Loopback redirect (`http://127.0.0.1:<port>`) | VS Code (Microsoft sign-in), gcloud, many CLIs | RFC 8252 section 7.3. No scheme registration; same-device by construction. |
| Device authorization (user types code in browser) | GitHub CLI, TV apps | RFC 8628. Works with no return channel; known phishing risk (section 5.4). |
| Manual code paste back into the app | gcloud `--no-browser`, Claude Code | What the return code implements. |
| Native biometric unlock of a local vault | 1Password | LocalAuthentication gate over a locally encrypted secret. |
| Passkey sign-in (platform authenticator) | Chrome, Safari, web apps | Electron 44 supports Touch ID WebAuthn via `app.configureWebAuthn`. |

Embedded webviews for sign-in are ruled out (RFC 8252 section 8.12; Google
blocks OAuth in embedded user agents).

Sources:
[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252),
[RFC 8628](https://www.rfc-editor.org/rfc/rfc8628),
[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636),
[Electron app API (protocol client, configureWebAuthn)](https://www.electronjs.org/docs/latest/api/app),
[Electron systemPreferences.promptTouchID](https://www.electronjs.org/docs/latest/api/system-preferences),
[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage),
[electron/electron#51255 Touch ID WebAuthn](https://github.com/electron/electron/pull/51255),
[electron/electron#52302 per-session opt-out](https://github.com/electron/electron/issues/52302),
[Better Auth device authorization plugin](https://better-auth.com/docs/plugins/device-authorization),
[Apple TN3125 provisioning profiles](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles).

## Scenario matrix

Ratings: works, degraded (user can finish with effort or copy is unclear),
broken (user cannot finish without outside help).

| Scenario | Before | After return code PR |
| --- | --- | --- |
| No default browser set | works (macOS falls back to Safari) | works |
| `openExternal` rejects | works (error + Try Again + Copy) | works |
| `openExternal` resolves but nothing visible | degraded ("Check your browser." forever) | works (after 30s: copy the link into any browser; finish with the code) |
| Deep link blocked, handler missing, second copy, translocated app | broken (signed in on web, app never hears back; a second copy shows its own sign-in) | works (loopback listener receives the completion without the scheme; handler reclaimed before each handoff; return code finishes) |
| Already signed in on web | degraded (must "Choose an account", which signs the browser out and asks for sign-in again) | works ("Continue as <email>" behind an explicit click, "Use a different account" signs out first — #18933) |
| Different account on web | works (explicit account switch) | works |
| Browser in another Space or full-screen app | degraded | works (30s hint, copy link, code) |
| Offline, or network drops mid-flow | degraded (browser errors; app waits) | works (retry; code entry reports "Could not reach Jovie" and keeps the flow) |
| Stale/expired state, replayed code | works (fresh handoff; exchange is single-use) | works (return code single-use, expiry message) |
| Two windows start auth at once | works (one pending flow; forged/mismatched flow rejected) | works |
| User closes the tab or cancels | works (Open Again, Copy, Cancel) | works |
| Corporate proxy or strict blockers | degraded (a blocker can eat the `jovie://` prompt) | works (code path uses `net.fetch`, which follows system proxy/PAC) |
| Safari vs Chrome vs Arc | degraded (Safari asks "Open Jovie?"; Chrome can remember "always allow"; a dismissed prompt stranded the user) | works (dismissed prompt: enter the code) |
| Sign-in finished on a phone or other computer | broken | works (copy link, type the code) |
| First launch after update | works (handler re-registered at launch) | works |
| Multiple Macs | works (independent sessions per app) | works |
| Session expiry, silent refresh | works (7-day rolling cookie, refreshed daily on use) | works |
| Sign out, then sign in again | degraded (full browser round trip) | works once Touch ID is enrolled (signed build with profile) |

## Touch ID sign-in: decision

Chosen: a device-bound WebAuthn passkey through the existing Better Auth
passkey plugin (`@better-auth/passkey`, `ba_passkeys`), created and used inside
the app's own `jov.ie` web context once `app.configureWebAuthn({ touchID })` is
enabled. The private key lives in the Secure Enclave, the server stores only
the public key, a stolen disk image holds no bearer secret, and deleting the
`ba_passkeys` row revokes it. Sign-in with it mints a normal server session.

Rejected: `systemPreferences.promptTouchID` gating a refresh credential in
`safeStorage`. The prompt is a UI gate, not a cryptographic binding, and it
needs a long-lived bearer secret on disk plus a new server credential type.

Enrollment policy (founder decision 2026-09-26): a sign-in from the last 10
minutes may add a passkey even when the account already has one. A passkey
added that way next to existing ones is a device passkey
(`device-passkey:<credentialId>` in `ba_verifications`): it signs in on that
Mac but writes no admin step-up receipt, so phishing a normal sign-in still
cannot mint an admin factor. The first passkey and passkeys added under a
live step-up keep their admin role. Delete and rename still need a step-up.

Flow: after a browser sign-in, `/auth/native-complete` offers "Sign In With
Touch ID Next Time?" once (the session is fresh at that moment). "Turn On
Touch ID" adds a platform passkey named "Jovie for Mac"; the choice is kept
in `userData/desktop-passkey.json` (enrolled or dismissed, no secrets, mode
600). Later handoffs show "Sign In With Touch ID" above "Continue In Browser"
and finish in the app with no browser trip. If Touch ID fails or is
cancelled, the browser path is right there.

Enablement: Touch ID turns on only in a packaged, signed build whose bundle
contains `Contents/embedded.provisionprofile` (Developer ID profile for
`app.jov.ie` or `app.jov.ie.staging`, team `G24T327LXT`), with the
`keychain-access-groups` entitlement `G24T327LXT.<bundle id>.webauthn`.
macOS only honors that entitlement when the profile authorizes it (TN3125);
without the profile the entitlement stops the app from launching, so the
entitlement and profiles land together. Local builds stay browser-only.

The profiles are committed (`apps/desktop/build/jovie-mac*.provisionprofile`,
App Store Connect names "Jovie Mac Developer ID" and "Jovie Mac Staging
Developer ID", bound to the Developer ID Application certificate that signs
releases, valid to 2031-05-10). A profile is not a secret; every shipped app
embeds it. Each channel's builder config pairs its own entitlements file with
its own profile, and the shell contract test checks the bundle IDs match. When
the signing certificate is renewed, regenerate both profiles against the new
certificate before the old one expires, or signed builds stop launching.

### Password managers (1Password, iCloud Keychain)

Passkeys saved in 1Password or iCloud Keychain do not work inside the Mac app.
They reach websites through a browser extension or the system credential
provider for browsers, and Electron's authenticator is its own Secure Enclave
store, separate from both. In the Mac app, Touch ID uses the device passkey
created for that Mac. In any browser, including the browser handoff,
1Password and iCloud passkeys work normally.

## Design brief (for the Pen design session)

Surface: the existing `/desktop-auth` handoff window (840 x 350 outer native bounds, 2.4:1, centered column, `max-w-90`, `MacCinematicSurface`). Keep the shell and brand treatment. The hierarchy below specializes JOV-6942 rules 2, 3, 5, 20, and 22 for a focused auth task. It does not create a second design canon or a whole-app button-count rule.

The browser-selected default state has a visible **Finish Signing In** heading and the support line **Continue in your browser, then return to Jovie.** Exactly three task controls are exposed:

1. Continue In Browser or Open Browser Again, the only full-width primary
   Button.
2. Other Sign-in Options, a subordinate canonical link Button that discloses
   the fallback group.
3. Cancel Sign-in, a canonical link Button beside the options disclosure in
   the same quiet utility row. It remains a semantic button with the shared 44px hit target.

The heading/support/primary group uses an 8px heading gap, 20px action gap, and
16px primary-to-utility gap (separating the 44px hit areas). The status region keeps two lines reserved with an
8px gap, preserving the primary through pending/error updates. These are this
focused task's geometry contract, not global control-spacing rules.

Native bounds are centered within the active display work area. Narrow displays
use a 2:1 content fallback, with a 280px preferred minimum height; smaller work
areas take precedence over minimums and aspect ratio. The renderer scrolls for
selected code/QR steps, long text, or text scaling; it never clips Back or Cancel
to preserve a decorative ratio. No state-driven native resize or auth protocol
change is introduced.

Ship now: the compact bounded shell and equivalent auth states. Re-evaluate when
exact installed Mac evidence shows clipped controls or conflicting emphasis;
then repair this same shell and its rendered geometry regression. Browser
fixture checks do not certify an authenticated native session.

Copy Sign-in Link, Enter A Code, and Scan With Phone do not exist in the focus order until the disclosure is open. Every supported option uses the same canonical tertiary row primitive. Return-code-dependent options are hidden when the installed Mac bridge cannot redeem a code.

For an enrolled returning user, Touch ID is the selected method. The same three-control hierarchy becomes Sign In With Touch ID, Other Sign-in Options, and Cancel Sign-in. Continue In Browser joins the equal fallback rows until selected. A cancelled or failed Touch ID attempt selects the browser step, makes its action primary, and keeps Touch ID reachable from the fallback group.

| State | Visible action area | Status and recovery |
| --- | --- | --- |
| Idle | Continue In Browser / Other Sign-in Options / Cancel Sign-in | Supporting copy explains the browser handoff before the controls. |
| Opening | Opening Browser... (disabled) / options disabled / Cancel Sign-in | Opening your browser... Duplicate browser invocation is suppressed. |
| Waiting | Open Browser Again / Other Sign-in Options / Cancel Sign-in | Check your browser. |
| Waiting 30s+ | Same three controls | Not seeing it? Copy the sign-in link and paste it into any browser. |
| Open failed | Try Again / Other Sign-in Options / Cancel Sign-in | The browser did not open. Try again, or copy the sign-in link. Retry receives focus. |
| Alternatives | Browser primary / disclosure / equal option rows / Cancel Sign-in | Copy, code, and phone are peer rows. Escape closes the group and restores focus to the disclosure. |
| Copying | Equal option rows, with copy disabled and honest in-progress label | Copying the sign-in link... Browser invocation is suppressed during the copy. |
| Copied | Copy Sign-in Link Again plus the other supported peer rows | Sign-in link copied. Paste it into any browser. |
| Clipboard failed | Same option group | The sign-in link could not be copied. Try again. |
| QR loading | Selected phone step only, with Back and Cancel Sign-in | Creating the QR code... Browser reopening is not a competing primary. |
| QR ready | QR of the sign-in link (176px, white card) / Enter A Code / Back / Cancel Sign-in | Finish signing in on your phone, then enter the code it shows. Enter A Code is direct and does not require a browser-step detour. |
| QR failed | Enter A Code / Back / Cancel Sign-in | The QR code could not be created. Choose another sign-in option. |
| Code entry | Canonical code input (XXXX-XXXX) / Continue / Back / Cancel Sign-in | The input receives focus. Browser reopening is absent. |
| Code wrong | Same, input keeps focus | That code did not match. Check it and try again. |
| Code expired | Same | This sign-in expired. Open the browser again for a new code. Back returns to the option group without cancelling the attempt. |
| Offline or network failure | Same | Could not reach Jovie. Check your connection and try again. The entered code remains available. |
| Signing in | Continue shows Signing In... and is disabled | Signing in... Status is announced without moving focus. |
| Completed | Selected code step remains until the native window transitions | Sign-in complete. Returning to Jovie... |
| Cancelled | No selected-method mutation | The native close action clears the pending flow and closes the handoff window. |
| Touch ID ready | Sign In With Touch ID / Other Sign-in Options / Cancel Sign-in | Touch ID is the sole primary. Browser, copy, code, and phone stay in the equal fallback group. |
| Touch ID working | Sign In With Touch ID (disabled) / options disabled / Cancel Sign-in | Waiting for Touch ID... Duplicate biometric invocation is suppressed. |
| Touch ID failed or cancelled | Continue In Browser / Other Sign-in Options / Cancel Sign-in | Touch ID did not sign you in. Continue in the browser instead. Browser receives focus; Touch ID remains available after disclosure. |

The status slot keeps a stable two-line minimum height. Capability resolution does not expose or reserve hidden fallback controls. Opening alternatives is an intentional local disclosure, so its bounded height change is allowed. Code and QR replace the browser action area instead of appending to it. Back changes the selected method and restores focus to its option row; it never cancels the pending attempt.

Pen ownership remains with the existing JOV-6709 design session. This brief records the implementation contract but does not claim a Pen node ID or human-certified baseline.

Browser return page (`/auth/native-return`, web card): under "Return to
Jovie", a divider, then "Jovie did not open? Enter this code in the app." and
the code in large mono, selectable.

Touch ID: after a first sign-in on a supported Mac, the completion screen asks once, "Sign In With Touch ID Next Time?" with "Turn On Touch ID" (primary) and "Not Now" (secondary), both canonical `@jovie/ui` buttons. Once enrolled, the handoff selects Touch ID as its sole primary method; browser, copy, code, and phone are peer fallbacks behind Other Sign-in Options.

Selecting code or phone replaces the Touch ID action area. A failed or cancelled biometric attempt selects and focuses Continue In Browser while keeping Touch ID available as a fallback. Status while waiting: "Waiting for Touch ID..."; on failure: "Touch ID did not sign you in. Continue in the browser instead."
