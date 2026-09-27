# Mac app sign-in: browser handoff, fallbacks, and Touch ID

Owner surface: `apps/desktop` (Electron main + preload) and the hosted web
routes it loads (`/desktop-auth`, `/auth/start`, `/auth/callback`,
`/auth/native-return`, `/api/auth/native/*`). Rules: `.claude/rules/auth.md`,
`.claude/rules/macos.md`. Prior decision: gbrain
`engineering/jovie-macos-browser-signin-recovery-2026-09-06`.

## How sign-in works

1. The main process mints PKCE (S256 verifier + challenge) and a flow nonce,
   and shows the `/desktop-auth` handoff window.
2. "Continue in Browser" opens `/auth/start?client=electron&...` in the default
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
600). Later handoffs show "Sign In With Touch ID" above "Continue in Browser"
and finish in the app with no browser trip. If Touch ID fails or is
cancelled, the browser path is right there.

Enablement: Touch ID turns on only in a packaged, signed build whose bundle
contains `Contents/embedded.provisionprofile` (Developer ID profile for
`app.jov.ie` or `app.jov.ie.staging`, team `G24T327LXT`), with the
`keychain-access-groups` entitlement `G24T327LXT.<bundle id>.webauthn`.
macOS only honors that entitlement when the profile authorizes it (TN3125);
without the profile the entitlement stops the app from launching, so the
entitlement and profiles land together. Local builds stay browser-only.

### Password managers (1Password, iCloud Keychain)

Passkeys saved in 1Password or iCloud Keychain do not work inside the Mac app.
They reach websites through a browser extension or the system credential
provider for browsers, and Electron's authenticator is its own Secure Enclave
store, separate from both. In the Mac app, Touch ID uses the device passkey
created for that Mac. In any browser, including the browser handoff,
1Password and iCloud passkeys work normally.

## Design brief (for the Pen design session)

Surface: the existing `/desktop-auth` handoff window (820 x 520, centered
column, `max-w-90`, `MacCinematicSurface`). Row order is fixed so state
changes never shift the column: action stack, two-line status, one text row.

| State | Action stack | Status line | Text row |
| --- | --- | --- | --- |
| Idle | Continue in Browser / Copy Sign-In Link / Cancel Sign-In | (empty) | Enter A Code · Scan With Phone (canonical link Buttons, sm) |
| Opening | Opening Browser... (disabled) / Copy (disabled) / Cancel | (empty) | Enter A Code · Scan With Phone |
| Waiting | Open Browser Again / Copy Sign-In Link / Cancel | Check your browser. | Enter A Code · Scan With Phone |
| Waiting 30s+ | same | Not seeing it? Copy the sign-in link and paste it into any browser. | Enter A Code · Scan With Phone |
| Copied | same | Sign-in link copied. Paste it into any browser. | Enter A Code · Scan With Phone |
| Open failed | Try Again / Copy / Cancel | The browser did not open. Try again, or copy the sign-in link. | Enter A Code · Scan With Phone |
| QR | QR of the sign-in link (176px, white card) | Scan with your phone to finish sign-in there. | Back To Browser Sign-in |
| Code entry | Code input (XXXX-XXXX, mono, letter-spaced) / Continue / Cancel | Signed in but Jovie did not open? Enter the code your browser shows. | Back To Browser Sign-in |
| Code wrong | same, input keeps focus | That code did not match. Check it and try again. | Back To Browser Sign-in |
| Code expired | same | This sign-in expired. Open the browser again for a new code. | Back To Browser Sign-in |
| Signing in | Continue shows Signing In... (disabled) | Signing in... | disabled |

Browser return page (`/auth/native-return`, web card): under "Return to
Jovie", a divider, then "Jovie did not open? Enter this code in the app." and
the code in large mono, selectable.

Touch ID: after a first sign-in on a Mac that supports it, the completion
screen asks once, "Sign In With Touch ID Next Time?" with "Turn On Touch ID"
(primary) and "Not Now" (secondary), both canonical `@jovie/ui` buttons. Once
enrolled, the handoff adds "Sign In With Touch ID" as the first row in both
the browser and code modes (so switching modes keeps the row count), and
"Continue in Browser" drops to the secondary style. Status while waiting:
"Waiting for Touch ID..."; on failure: "Touch ID did not sign you in.
Continue in the browser instead."
