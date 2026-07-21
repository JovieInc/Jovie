# Desktop App Signing & Auto-Update Setup

> One-time setup. Once these 6 GitHub secrets are added, every push to `main`
> that bumps `VERSION` (or changes `desktop-release.yml`) will produce a
> signed, notarized macOS DMG that the existing app can auto-update to.
> Notarization uses the modern App Store Connect API key flow — no
> app-specific passwords to rotate.

## What this fixes

Without code signing:

- macOS Gatekeeper warns/blocks installation ("Apple cannot verify this developer")
- electron-updater silently rejects updates because Squirrel.Mac requires
  signature consistency between installed and downloaded versions
- An installed user is permanently stuck on the version they first downloaded

The desktop release pipeline is already built and runs automatically on push
to `main`. It just needs these secrets to actually sign and notarize the
output. When secrets are absent, the workflow still builds (unsigned DMG)
but skips signing/notarization with a warning.

## One-time setup (≈15 minutes)

### 1. Find or create the Developer ID Application certificate

The `Log Your Body` Apple Developer team is already enrolled, so use that
team's account (or whichever team owns `appId: app.jov.ie`).

**Option A — already have the cert in Keychain:**

```bash
security find-identity -v -p codesigning
```

Look for `Developer ID Application: <Your Name> (TEAMID)`. If present, skip
to step 2.

**Option B — generate a new cert:**

1. Open Xcode → Settings → Accounts → select your Apple ID → Manage Certificates
2. Click `+` → `Developer ID Application`
3. Verify with `security find-identity -v -p codesigning`

### 2. Export the cert as `.p12`

1. Open **Keychain Access** → `login` keychain → Certificates
2. Right-click `Developer ID Application: …` → Export
3. Save as `jovie-cert.p12`, choose a strong password (you'll need it in step 4)

### 3. Create an App Store Connect API key for `notarytool`

1. Sign in at <https://appstoreconnect.apple.com/access/integrations/api>
2. Click `+` → choose **Developer** access (sufficient for notarization)
3. Name it `jovie-notarytool` and download the `.p8` file (one-time download —
   save it; Apple won't show it again)
4. Note the **Key ID** (10-char string in the row, e.g. `ABC123DEF4`) and the
   **Issuer ID** (UUID at the top of the Keys page)

### 4. Get the Team ID

1. Sign in at <https://developer.apple.com/account>
2. Membership → Team ID is the 10-character string (e.g. `A1B2C3D4E5`)

### 5. Add 6 GitHub secrets

```bash
# 1. Base64-encode the .p12 cert
base64 -i jovie-cert.p12 | gh secret set MAC_CERTIFICATE_BASE64

# 2. The .p12 export password (from step 2)
gh secret set MAC_CERTIFICATE_PASSWORD

# 3. Team ID from step 4
gh secret set APPLE_TEAM_ID

# 4. The .p8 API key contents from step 3 (paste raw PEM, base64 also accepted)
gh secret set APPLE_API_KEY < AuthKey_ABC123DEF4.p8

# 5. The Key ID from step 3
gh secret set APPLE_API_KEY_ID

# 6. The Issuer ID (UUID) from step 3
gh secret set APPLE_API_ISSUER
```

`gh secret set` will prompt for each value. Verify with `gh secret list | grep -E 'MAC_|APPLE_'`.

### 6. Securely dispose of the local `.p12` and `.p8`

```bash
rm -P jovie-cert.p12 AuthKey_*.p8   # macOS
# Linux alternative:
shred -u jovie-cert.p12 AuthKey_*.p8
```

The cert and API key live in GH secrets now; don't keep copies in a downloads folder.

## Verifying the setup

After secrets are added, trigger a manual build to verify before merging
real changes:

```bash
gh workflow run desktop-release.yml -f environment=production
gh run watch
```

A successful run produces a release at <https://github.com/JovieInc/Jovie/releases/latest>
with a signed `Jovie-<version>-universal.dmg`. Verify signing on the artifact:

```bash
# After downloading the DMG:
hdiutil attach Jovie-<version>-universal.dmg
codesign -dv --verbose=4 /Volumes/Jovie/Jovie.app
spctl --assess -vv /Volumes/Jovie/Jovie.app
# Expected: "accepted" + "source=Notarized Developer ID"
```

## Recovering an existing installed (unsigned) app

Existing users who installed an unsigned build (pre-signing setup) cannot
auto-update — Squirrel rejects the signature change. They need to manually
download the first signed build once. The renderer `useDesktopUpdate` hook
falls back to opening the GitHub releases page when the bridge is unusable
(see `apps/web/lib/desktop/electron-bridge.ts`).

After installing the first signed build, every subsequent push triggers an
auto-update they can apply with one click.

## Cost & cadence

- Apple Developer Program: $99/year (already enrolled via `Log Your Body`)
- Notarization: free, ~2-5 min latency per build
- Cert renewal: every 5 years (Developer ID certs)

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build succeeds but DMG is unsigned | `MAC_CERTIFICATE_BASE64` secret missing or empty | Re-run step 5 |
| `electron-builder` fails with `code signing identity not found` | `MAC_CERTIFICATE_PASSWORD` is wrong | Re-export `.p12` and re-set the secret |
| Notarization times out | Apple's notary service is slow; usually 2-15 min | Re-run the workflow; if persistent, check <https://www.apple.com/support/systemstatus/> |
| `notarytool` fails with `Invalid credentials` | API key revoked, wrong Key ID, or wrong Issuer ID | Re-create the App Store Connect API key (step 3) and update the three `APPLE_API_*` secrets |
| `Staged Apple API key is not a valid PEM .p8 file` | `APPLE_API_KEY` secret is corrupt or wasn't the .p8 contents | Re-download the .p8 from App Store Connect and re-set the secret with `gh secret set APPLE_API_KEY < AuthKey_*.p8` |
| App installs but won't update | First signed install — older unsigned binary can't transition | One-time manual download of the new signed DMG (renderer falls back to download URL automatically) |

## Related files

- `apps/desktop/electron-builder.yml` — production signing config
- `apps/desktop/electron-builder.staging.yml` — staging signing config
- `apps/desktop/build/entitlements.mac.plist` — hardened-runtime entitlements
- `.github/workflows/desktop-release.yml` — auto-trigger + keychain setup + build
- `apps/web/lib/desktop/electron-bridge.ts` — guarded renderer wrappers + fallback
- `apps/web/lib/desktop/electron-bridge.test.ts` — regression test for the
  shame-on-me bug (`E.onUpdateAvailable is not a function`)
