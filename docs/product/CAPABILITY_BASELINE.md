# Capability Baseline

Status: Operational (inherits [`canon/PRODUCT.md`](../../canon/PRODUCT.md) "Opinions: outcomes over knobs")
Owner: Summer (governor agent); founder owns taste calls
Last updated: 2026-09-26
Latest audit: [`capability-audit-2026-09-26.md`](./capability-audit-2026-09-26.md)

The table-stakes checklist every Jovie surface is held to. A gap here is a
`capability-gap` issue, not a debate. Items marked **(native)** apply only to
the Mac and iOS apps. This is a checklist of outcomes, not a spec: the default
shipped for each item should need no user setup.

Surfaces: **Web** (jov.ie app), **Mac** (`apps/desktop`, Electron),
**iOS** (`apps/ios`), **LYB** (JovieInc/LogYourBody iOS), **Public** (public
profiles and smart links, fan-facing), **Agents** (API, MCP, CLI).

## Checklist

### Auth and security

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| AUTH-1 | Account recovery without support (password reset, or for passwordless: email code + change email) | Web, Mac, iOS, LYB | Linear, Notion (email-code login + change email) |
| AUTH-2 | Email verified before the account is usable | Web, LYB | Stripe, Linear |
| AUTH-3 | Passkeys or a second factor available to every user, not only admins | Web, Mac, iOS | Stripe (2FA + passkeys), Linear (passkeys), Notion (2-step) |
| AUTH-4 | Biometric unlock / sign-in **(native)** | Mac, iOS, LYB | 1Password, banking apps |
| AUTH-5 | See active sessions and revoke one | Web | Stripe, Notion, Linear |
| AUTH-6 | Sign out everywhere (including third-party app grants) | Web | Stripe, Google |
| AUTH-7 | New-device / suspicious sign-in notice with a one-click "not me" action | Web | Stripe, Google, Spotify |
| AUTH-8 | See and revoke apps connected via OAuth | Web, Agents | Google, GitHub, Notion "My connections" |

### Account

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| ACCT-1 | Self-serve account deletion (in-app on iOS: App Store Guideline 5.1.1(v)) | Web, iOS, LYB | Apple guideline; every App Store app |
| ACCT-2 | Self-serve data export | Web, LYB | GDPR Art. 20; Notion, Linear |
| ACCT-3 | Change email | Web | Linear, Notion, Stripe |

### Billing

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| BILL-1 | Receipts / invoices downloadable | Web, LYB | Stripe portal, App Store |
| BILL-2 | Cancel without contacting support | Web, LYB | FTC click-to-cancel; Stripe portal |
| BILL-3 | Change plan with a price preview | Web | Linear, Notion |
| BILL-4 | Failed-payment recovery (dunning email + update card) | Web | Stripe Smart Retries |
| BILL-5 | Tax handled and shown on invoices | Web | Stripe Tax |
| BILL-6 | Restore purchases **(native IAP)** | LYB | App Store requirement |

### Notifications

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| NOTIF-1 | Notification preferences (one level, not a matrix) | Web, iOS, LYB | Linear, artist analytics apps |
| NOTIF-2 | One-click unsubscribe in every marketing/fan email | Web, Public | RFC 8058, Gmail/Yahoo sender rules |
| NOTIF-3 | Native notifications **(native)** | Mac, iOS, LYB | Linear, Slack, artist analytics apps |

### Data

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| DATA-1 | Import from where users already are | Web (Linktree/Beacons/DSPs), LYB (Apple Health) | Beacons, Linktree import; fitness apps via HealthKit |
| DATA-2 | Backups / point-in-time recovery of user data | Web, LYB | Neon PITR; Notion page history |

### Accessibility, onboarding, support, comms

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| A11Y-1 | Keyboard/VoiceOver usable, WCAG AA contrast, Dynamic Type on native | All UI surfaces | WCAG 2.2 AA; Apple HIG |
| ONB-1 | Guided first run that reaches first value without docs | Web, iOS, LYB | Linear, Linktree (import-first), fitness apps |
| HELP-1 | In-product path to help and a human | Web, Mac, iOS, LYB | Linear (Help menu, Contact us), Notion |
| HELP-2 | Help menu **(Mac)** | Mac | Every Mac app (Apple HIG) |
| STAT-1 | Public status page | All | Linear, Stripe, Notion status pages |
| STAT-2 | In-app incident notice while degraded | Web, Mac, iOS | Vercel, Linear, Stripe dashboard |
| NEW-1 | "What's new" in product and a public changelog | Web, Mac, iOS, LYB | Linear changelog, Notion "What's new" |

### Native app hygiene

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| NAT-1 | Auto-update | Mac | Linear, Slack (Squirrel/Sparkle) |
| NAT-2 | Deep links open the right screen | Mac, iOS, LYB | Linear, Notion |
| NAT-3 | Crash and error reporting | Mac, iOS, LYB | Sentry/Crashpad in every shipped app |
| NAT-4 | Open at login (menu-bar/tray apps) | Mac | Linear, Raycast, 1Password |

### Public profile and smart links

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| PUB-1 | Rich link previews (OG images) | Public | Linktree, Beacons |
| PUB-2 | QR code for the profile | Public | Linktree, Beacons |
| PUB-3 | Report abuse / takedown path on the profile | Public | Linktree (Report on profile) |
| PUB-4 | Cookie consent where legally required | Public | Linktree |
| PUB-5 | Fan email capture with consent and unsubscribe | Public | Linktree, Beacons, Laylo |

### Agents (API, MCP, CLI)

| ID | Capability | Applies to | Peer evidence |
|---|---|---|---|
| AGT-1 | Published machine-readable contract (OpenAPI, llms.txt) | Agents | Stripe, Linear |
| AGT-2 | Authenticated access via OAuth with scoped, revocable grants | Agents | Linear MCP, Notion MCP, Stripe |
| AGT-3 | Rate limits with clear 429s | Agents | Stripe, Linear |
| AGT-4 | Public docs and API reference | Agents | Stripe, Linear |

## Not baseline (held configurability)

Per canon, these are **held until 3 distinct paying Pro asks** and get no issue.
Record asks in customer asks / waitlist wants:

- AI model or provider picker
- Personal API tokens (OAuth grants cover agents)
- Custom domains for profiles
- Custom CSS / theme builder for profiles
- Custom analytics dashboards and report builders
- Per-event, per-channel notification matrices

## Recurrence

Runs on events first, with a weekly fallback. Summer owns it.

**Triggers**

1. **New surface or platform ships** (a new `apps/*` directory, a first TestFlight/notarized build, a new public route family): audit that surface against every row whose "Applies to" matches.
2. **Dogfood finding** labeled `capability-gap`, or any issue whose title reads "no way to ..." / "can't ...": Summer checks it against this list. If it is a table-stakes miss not on the list, the list is incomplete; add the row.
3. **Customer ask** (support, waitlist wants, Linear customer need): classify with the canon table. Table-stakes or outcome-deepening files an issue; configurability increments the ask count under "held"; taste becomes a founder card.
4. **Changelog entry** that adds or removes a capability: flip the matching audit cell.
5. **Weekly fallback** (Monday): re-run the audit only for cells still `missing`/`partial` and confirm their issues are open; close cells whose issue shipped.

**How Summer reads it.** Summer reads Linear and GitHub but not repo files. Mirror this checklist and the latest audit table into a Linear document ("Capability Baseline", team JOV) on merge, and to a GBrain page (`jovie/capability-baseline`) for other agents. The repo file stays canonical; the mirror is regenerated from it, never edited by hand. Summer tracks progress through the `capability-gap` label: open count per surface is the health metric, and a new surface with zero `capability-gap` issues and no audit row is itself a gap.

**Output of each run:** an updated audit table (new dated file only when a surface is added or more than 5 cells change), issues for new gaps, "held" ask counts, and at most 5 taste cards.
