# Capability Audit 2026-09-26

Baseline: [`CAPABILITY_BASELINE.md`](./CAPABILITY_BASELINE.md). Classification rules: [`canon/PRODUCT.md`](../../canon/PRODUCT.md) "Opinions: outcomes over knobs".

Method: `rg` over `origin/main` at `fe1292a067b5` plus `docs/FEATURE_REGISTRY.md` and `apps/ios/feature-status.csv`; LogYourBody read-only from a depth-1 clone of JovieInc/LogYourBody `main`. This is source evidence. It is not proof of deployment or runtime behavior.

Status: **present** (shipped in source), **partial** (exists but incomplete or not user-reachable), **missing**. `n/a` rows are omitted. The Mac app loads the web app (`apps/desktop/src/main.ts` `APP_ENTRY_URL`), so web account, billing and settings rows are inherited and are only counted under Web.

## Summary

| Surface | Present | Partial | Missing |
|---|---|---|---|
| Web | 16 | 5 | 4 |
| Mac | 4 | 2 | 5 |
| iOS | 4 | 2 | 4 |
| LYB iOS | 14 | 1 | 0 |
| Public profile / smart links | 5 | 2 | 0 |
| Agents (API / MCP / CLI) | 3 | 1 | 0 |
| **Total** | **46** | **13** | **13** |

## Web (jov.ie app)

| ID | Status | Evidence | Issue |
|---|---|---|---|
| AUTH-1 recovery | partial | Passwordless: email OTP (`emailOTP` in `apps/web/lib/auth/better-auth.ts`) + Google/Apple. No way to move the account to a new inbox. | JOV-6711 |
| AUTH-2 email verified | present | Email OTP sign-in verifies ownership; OAuth emails are provider-verified. | |
| AUTH-3 passkeys / 2FA | partial | `passkey()` plugin is enabled but enrollment is admin step-up only (`lib/auth/admin-passkey-step-up.ts`, `lib/admin/mfa.ts`). | JOV-6593 |
| AUTH-5 sessions | present | `components/features/dashboard/organisms/account-settings/SessionManagementCard.tsx` (JOV-6592). | |
| AUTH-6 sign out everywhere | partial | "Sign out other sessions" in the same card; OAuth provider grants survive it. | JOV-6633 |
| AUTH-7 suspicious sign-in notice | missing | No new-device email in `lib/email` or `lib/auth`. | JOV-6627 |
| AUTH-8 connected apps | missing | `oauthProvider` issues grants (LYB, MCP clients); no list/revoke UI. | JOV-6712 |
| ACCT-1 delete | present | `app/api/account/delete/route.ts`, `app/app/(shell)/settings/delete-account/`. | |
| ACCT-2 export | present | `app/api/account/export/route.ts`, `useExportDataMutation`. | |
| ACCT-3 change email | missing | `AccountSettingsSection.tsx`: "Full email/provider mutation parity is deferred"; `/api/account/email` only syncs. | JOV-6711 |
| BILL-1 receipts | present | Stripe portal (`app/api/stripe/portal/route.ts`), "Payment & Invoices" in `BillingActionsSection.tsx`. | |
| BILL-2 cancel | present | Cancel dialog in `BillingActionsSection.tsx`. Scheduled-cancel banner still open. | JOV-2272 |
| BILL-3 change plan | present | `app/api/stripe/plan-change/route.ts` + `preview/`. | |
| BILL-4 failed payment | present | `lib/stripe/dunning.ts`, `lib/email/templates/payment-failed.ts`. | |
| BILL-5 tax | present | `automatic_tax` in `lib/stripe/client.ts`. | |
| NOTIF-1 preferences | present | `app/api/notifications/preferences/route.ts`, `SettingsNotificationsSection`. | |
| NOTIF-2 unsubscribe | present | `lib/email/one-click-unsubscribe-token.ts`. | |
| DATA-1 import | present | `lib/ingestion/jobs/linktree.ts`, `beacons.ts`; Spotify auto-sync (FEATURE_REGISTRY). | |
| DATA-2 backups | partial | Neon-hosted; restore is manual-only by rule (`.claude/rules/infra.md`); no verified restore drill in source. | JOV-6056 |
| A11Y-1 | present | `tests/e2e/a11y.spec.ts`, `axe-audit.spec.ts`, `chat-axe.spec.ts`. | |
| ONB-1 | present | `app/onboarding/`. | |
| HELP-1 | present | `app/(marketing)/support`, docs.jov.ie (`apps/docs`). | |
| STAT-1 status page | present | status.jov.ie in `MarketingFooter`. | |
| STAT-2 in-app incident | missing | Status is linked only from the marketing footer. | JOV-6720 |
| NEW-1 what's new | partial | Public `app/(marketing)/changelog`; in-app What's New not delivered yet. | JOV-5786, JOV-5788 |

## Mac (`apps/desktop`)

| ID | Status | Evidence | Issue |
|---|---|---|---|
| AUTH-4 Touch ID | missing | No `promptTouchID` / `safeStorage` in `apps/desktop/src`. Being built by the mac-auth worker. | JOV-6709, JOV-5828 |
| NOTIF-3 native notifications | missing | No `Notification` use in `apps/desktop/src`. | JOV-6716 |
| A11Y-1 | present | Inherits web axe coverage. | |
| HELP-1 | present | Support reachable through web settings. | |
| HELP-2 Help menu | missing | App menu (`main.ts` ~L2420-2514) has no Help menu. | JOV-6717 |
| STAT-2 in-app incident | missing | Inherits web gap. | JOV-6720 |
| NEW-1 what's new | partial | Update modal with release notes in progress. | JOV-6683 |
| NAT-1 auto-update | present | `src/desktop-auto-update.ts`. | |
| NAT-2 deep links | present | `open-url` + PKCE handling in `src/main.ts`, `desktop-auth-browser-route.ts`. | |
| NAT-3 crash reporting | partial | `desktop-security-reporting.ts` logs security events to console only; no `crashReporter`/Sentry. | JOV-6719 |
| NAT-4 open at login | missing | No `setLoginItemSettings`. | JOV-6718 |

## iOS (`apps/ios`)

| ID | Status | Evidence | Issue |
|---|---|---|---|
| AUTH-4 Face ID | missing | No `LAContext` in `apps/ios/Jovie`. | JOV-6714 |
| ACCT-1 in-app delete | missing | `Features/Settings/SettingsView.swift` has Support/Billing/Privacy/Terms/Log Out only. Blocks App Store 5.1.1(v). | JOV-6713 |
| NOTIF-3 push | missing | No `UNUserNotificationCenter` / APNs registration. | JOV-6715 |
| A11Y-1 | partial | ~20 files set `accessibilityLabel`; no accessibility contract test. | JOV-6721 |
| ONB-1 | present | Native profile completion (IOS-005). | |
| HELP-1 | present | Support row in `SettingsView.swift`. | |
| STAT-2 in-app incident | missing | Folded into JOV-6720 (native follow-up noted). | JOV-6720 |
| NEW-1 what's new | partial | iOS consumer of the daily What's New post not built. | JOV-5789 |
| NAT-2 deep links | present | `onOpenURL` in `App/LiveRootContainer.swift`. | |
| NAT-3 crash reporting | present | `Core/Observability/SentryObservabilityProvider.swift`. | |

Auth rows AUTH-1/2/3/5-8 for iOS go through web browser auth (IOS-002) and inherit the web status.

## LogYourBody iOS (JovieInc/LogYourBody, read-only)

LYB signs in through Jovie identity (`logyourbody-ios` is a trusted OAuth client in `apps/web/lib/auth/better-auth.ts`), so AUTH-1/2/3/5-8 inherit Web.

| ID | Status | Evidence (paths under `apps/ios/LogYourBody/`) | Issue |
|---|---|---|---|
| AUTH-4 biometric | present | `Views/BiometricLockView.swift` | |
| ACCT-1 delete | present | `DesignSystem/Organisms/SettingsSectionGroup.swift` `onDeleteAccount` | |
| ACCT-2 export | present | `ExportDataView` via `Views/IntegrationsView.swift` | |
| BILL-1 receipts | present | App Store receipts | |
| BILL-2 cancel | present | `Views/PreferencesView+SecuritySubscriptionSection.swift` manage-subscription row | |
| BILL-6 restore | present | `Views/PaywallView.swift` "Restore Purchases" | |
| NOTIF-1 | present | Daily weigh-in reminder toggle, `Services/NotificationManager.swift` | |
| NOTIF-3 | present | Local reminders cover the outcome; remote push not needed today | |
| DATA-1 import | present | HealthKit import, `Services/HealthKitManager+Part02.swift` | |
| DATA-2 backups | partial | Data plane consolidation onto Neon still open | JOV-4831 |
| A11Y-1 | present | `LogYourBodyTests/UIAccessibilityContractTests.swift` | |
| ONB-1 | present | `LogYourBodyUITests/OnboardingGoldenPathUITests.swift` | |
| HELP-1 | present | Help entry in `Views/DashboardViewLiquid+HomeV2Settings.swift` (findability tracked in JOV-6094) | |
| NEW-1 | present | `showWhatsNew` in `ContentView.swift` | |
| NAT-3 | present | `Services/ErrorTrackingService.swift` | |

## Public profile and smart links

| ID | Status | Evidence | Issue |
|---|---|---|---|
| PUB-1 OG images | present | `apps/web/app/[username]/opengraph-image.tsx` | |
| PUB-2 QR | present | Dashboard QR, venue mode (IOS-007/008); `ProfileSidebarHeader.tsx` | |
| PUB-3 report abuse | partial | Only `app/(dynamic)/legal/dmca`; no report action on profiles | JOV-6599 |
| PUB-4 cookie consent | present | `apps/web/lib/cookies/` | |
| PUB-5 fan capture | present | `/username/subscribe`, contact capture (FEATURE_REGISTRY) | |
| NOTIF-2 unsubscribe | present | `lib/email/one-click-unsubscribe-token.ts` | |
| A11Y-1 | partial | `axe-audit.spec.ts` excludes public profile surfaces | JOV-6725 |

## Agents (API / MCP / CLI)

| ID | Status | Evidence | Issue |
|---|---|---|---|
| AGT-1 contract | present | `apps/web/app/api/v1/openapi.json`; `packages/jovie-cli` (`api openapi`, `docs llms`) | |
| AGT-2 OAuth grants | partial | `oauthProvider` + Ovie MCP returns `WWW-Authenticate`; users cannot see/revoke grants | JOV-6712, JOV-6633 |
| AGT-3 rate limits | present | `app/api/v1/[username]/route.ts` rate-limit headers | |
| AGT-4 docs | present | `apps/docs/app/docs/api-reference/page.mdx` | |

## Held (needs Pro demand)

Configurability. No issues filed. Revisit at 3 distinct paying Pro asks:

- AI model / provider picker
- Personal API tokens (OAuth grants cover agents)
- Custom domains for public profiles
- Custom CSS / theme builder for profiles
- Custom analytics dashboards and report builders
- Per-event, per-channel notification matrices

## Taste (founder cards)

1. Biometric lock on iOS (JOV-6714): default on, or offered once after first sign-in?
2. Mac open at login (JOV-6718): register by default, or ask once at first launch?
3. Passkey-first sign-in (JOV-6593): make passkey the primary button once enrolled, with email code as fallback?
4. In-app incident banner (JOV-6720): show only for major incidents, or for any degraded component?
5. Report on public profiles (JOV-6599): visible link in the profile footer, or tucked into the share/overflow menu?

## Issues filed

New (all JOV, Backlog, `capability-gap`):

| Issue | Priority | Title |
|---|---|---|
| JOV-6711 | High | Web: self-serve change email with verification of the new address |
| JOV-6712 | High | Web: list and revoke apps connected to your Jovie account (OAuth grants) |
| JOV-6713 | High | iOS: in-app account deletion (App Store 5.1.1(v)) and data export entry |
| JOV-6714 | High | iOS: Face ID / Touch ID unlock for the signed-in app |
| JOV-6715 | Medium | iOS: push notifications for existing notification events (APNs) |
| JOV-6716 | Medium | Mac: native macOS notifications for inbox and chat events |
| JOV-6717 | Medium | Mac: add the standard Help menu (agent-ready) |
| JOV-6718 | Medium | Mac: open at login via the system login-item API (agent-ready) |
| JOV-6719 | Medium | Mac: crash and error reporting for main and renderer processes |
| JOV-6720 | Medium | Web app: show active incidents from status.jov.ie inside the app (agent-ready) |
| JOV-6721 | Medium | iOS: VoiceOver labels and Dynamic Type baseline (agent-ready) |
| JOV-6725 | Medium | Public profile and smart links: axe accessibility coverage (agent-ready) |

Existing issues linked and labeled `capability-gap` instead of duplicated: JOV-6627, JOV-6593, JOV-6709, JOV-5828, JOV-6599, JOV-6633, JOV-5788, JOV-5789, JOV-2272, JOV-6056, JOV-4831, JOV-6683.
