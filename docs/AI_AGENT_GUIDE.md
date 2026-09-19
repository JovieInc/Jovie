# AI Agent Developer Guide

Use this file as an API/cron/webhook inventory. For execution policy start at
[CLAUDE.md](../CLAUDE.md); for instruction, skill, or harness changes read the
[context contract](agent-context/README.md). Search the relevant section instead
of loading this inventory for unrelated tasks.

Quick-reference for AI agents working in the Jovie codebase. For hard guardrails and enforcement rules, see [`AGENTS.md`](../AGENTS.md).

---

## 0. Design System Contract (llms.txt)

Before editing UI, read the auto-generated design contract:

- **[`docs/llms-design-manifest.txt`](llms-design-manifest.txt)** — llms.txt-style token + component manifest sourced from `apps/web/styles/design-system.css`, `@jovie/ui` primitives, canonical surfaces, and design ESLint guardrails.
- **Regenerate after token/rule changes:** `pnpm ds:llms-manifest` (CI check: `pnpm ds:llms-manifest:check`)
- **Human specs:** [`DESIGN.md`](../DESIGN.md), [`docs/DESIGN_TOKENS.md`](DESIGN_TOKENS.md)

---

## 1. API Route Inventory

All routes live under `apps/web/app/api/`. Auth is via self-hosted Better Auth (`getCachedAuth()` from `@/lib/auth/cached`) unless noted. Jovie owns the configuration in `apps/web/lib/auth/better-auth.ts` and stores identity in Neon Postgres through Drizzle; this is not managed Neon Auth. `getCachedAuth().userId` is the app user UUID. See `.claude/rules/auth.md` for current client/server and test flows.

### Account

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/account/delete` | POST | Better Auth | Delete user account |
| `/api/account/email` | POST | Better Auth | Update account email |
| `/api/account/export` | GET | Better Auth | Export user data (GDPR) |

### Admin (requires admin role)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/admin/batch-ingest` | POST | Admin | Bulk creator ingestion |
| `/api/admin/campaigns/invites` | GET | Admin | List campaign invites |
| `/api/admin/campaigns/settings` | GET | Admin | Campaign settings |
| `/api/admin/campaigns/stats` | GET | Admin | Campaign statistics |
| `/api/admin/creator-avatar` | POST | Admin | Upload creator avatar |
| `/api/admin/creator-ingest` | POST | Admin | Ingest single creator |
| `/api/admin/creator-ingest/rerun` | POST | Admin | Re-run creator ingestion |
| `/api/admin/creator-invite` | POST | Admin | Send creator invite |
| `/api/admin/creator-invite/bulk` | POST | Admin | Bulk send invites |
| `/api/admin/creator-invite/bulk/stats` | GET | Admin | Bulk invite stats |
| `/api/admin/creator-social-links` | GET/POST | Admin | Manage creator social links |
| `/api/admin/creators` | GET | Admin | List creators |
| `/api/admin/feedback` | GET | Admin | List user feedback |
| `/api/admin/feedback/[id]/dismiss` | POST | Admin | Dismiss feedback item |
| `/api/admin/fit-scores` | GET | Admin | Creator fit scores |
| `/api/admin/impersonate` | POST | Admin | Impersonate user |
| `/api/admin/leads` | GET | Admin | List leads |
| `/api/admin/leads/[id]` | PATCH | Admin | Update lead |
| `/api/admin/leads/keywords` | GET | Admin | Lead keywords |
| `/api/admin/leads/qualify` | POST | Admin | Qualify leads |
| `/api/admin/overview` | GET | Admin | Admin dashboard overview |
| `/api/admin/roles` | POST | Admin | Manage user roles |
| `/api/admin/screenshots/[filename]` | GET | Admin | Serve screenshot |
| `/api/admin/users` | GET | Admin | List users |
| `/api/admin/waitlist` | GET | Admin | Waitlist management |

### Audience (public/token-based)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/audience/click` | POST | Token | Track audience click |
| `/api/audience/opt-in` | POST | Token | Audience opt-in |
| `/api/audience/unsubscribe` | GET | Token | Unsubscribe from emails |
| `/api/audience/visit` | POST | Token | Track audience visit |

### Billing & Stripe

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/billing/health` | GET | Better Auth | Billing system health |
| `/api/billing/history` | GET | Better Auth | Invoice history |
| `/api/billing/status` | GET | Better Auth | Current billing status |
| `/api/stripe/cancel` | POST/GET | Better Auth | Cancel subscription |
| `/api/stripe/checkout` | POST/GET | Better Auth | Create checkout session |
| `/api/stripe/plan-change` | POST/GET/DELETE | Better Auth | Change/preview/cancel plan |
| `/api/stripe/plan-change/preview` | POST/GET | Better Auth | Preview plan change cost |
| `/api/stripe/portal` | POST/GET | Better Auth | Stripe customer portal |
| `/api/stripe/pricing-options` | GET | Public | Available pricing tiers |
| `/api/stripe/webhooks` | POST/GET | Stripe sig | Stripe webhook handler |
| `/api/stripe-connect/disconnect` | POST | Better Auth | Disconnect Stripe Connect |
| `/api/stripe-connect/onboard` | POST | Better Auth | Start Connect onboarding |
| `/api/stripe-connect/return` | GET | Better Auth | Connect onboarding return |
| `/api/stripe-connect/status` | GET | Better Auth | Connect account status |

### Chat (Jovie AI)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/chat` | POST | Better Auth | Send chat message (streaming) |
| `/api/chat/confirm-edit` | POST | Better Auth | Confirm AI-suggested edit |
| `/api/chat/confirm-link` | POST | Better Auth | Confirm AI-suggested link |
| `/api/chat/confirm-remove-link` | POST | Better Auth | Confirm link removal |
| `/api/chat/conversations` | GET | Better Auth | List conversations |
| `/api/chat/conversations/[id]` | GET | Better Auth | Get conversation |
| `/api/chat/conversations/[id]/messages` | GET | Better Auth | Get conversation messages |
| `/api/chat/usage` | GET | Better Auth | Chat usage stats |

### Cron Jobs (CRON_SECRET bearer token)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/cron/billing-reconciliation` | GET | CRON_SECRET | Reconcile billing state |
| `/api/cron/cleanup-idempotency-keys` | GET | CRON_SECRET | Clean expired idempotency keys |
| `/api/cron/cleanup-photos` | GET | CRON_SECRET | Remove orphaned photos |
| `/api/cron/daily-maintenance` | GET | CRON_SECRET | Daily maintenance tasks |
| `/api/cron/data-retention` | GET | CRON_SECRET | Data retention enforcement |
| `/api/cron/frequent` | GET | CRON_SECRET | Frequently-run tasks |
| `/api/cron/generate-insights` | GET | CRON_SECRET | Generate AI insights |
| `/api/cron/pixel-forwarding` | GET | CRON_SECRET | Forward tracking pixels |
| `/api/cron/process-campaigns` | GET | CRON_SECRET | Process email campaigns |
| `/api/cron/process-pre-saves` | GET | CRON_SECRET | Process pre-save queue |
| `/api/cron/schedule-release-notifications` | GET | CRON_SECRET | Schedule release alerts |
| `/api/cron/send-release-notifications` | GET | CRON_SECRET | Send release alerts |

### Inbox Founder Reviews (authenticated founder surface)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/inbox/founder-reviews` | GET/POST | Better Auth | List or persist owner-bound review receipts before Inbox decisions |
| `/api/inbox/founder-reviews/upload-token` | POST | Better Auth / signed Blob callback | Issue private-audio upload tokens and persist expiring cleanup leases |
| `/api/inbox/founder-reviews/[id]/media` | GET/DELETE | Better Auth | Stream or delete retained private audio for an owned receipt |
| `/api/inbox/founder-reviews/[id]/outcome` | PATCH | Better Auth | Persist failed action state or verify applied state from canonical suggested actions |

### Dashboard (authenticated creator)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/dashboard/activity/recent` | GET | Better Auth | Recent activity feed |
| `/api/dashboard/analytics` | GET | Better Auth | Analytics data |
| `/api/dashboard/audience/members` | GET | Better Auth | Audience members list |
| `/api/dashboard/audience/subscribers` | GET | Better Auth | Email subscribers list |
| `/api/dashboard/earnings` | GET | Better Auth | Earnings/tips data |
| `/api/dashboard/pixels` | GET/POST | Better Auth | Ad pixel settings |
| `/api/dashboard/profile` | GET | Better Auth | Dashboard profile data |
| `/api/dashboard/releases/[releaseId]/analytics` | GET | Better Auth | Release analytics |
| `/api/dashboard/releases/[releaseId]/tracks` | GET | Better Auth | Release tracks |
| `/api/dashboard/social-links` | GET | Better Auth | Social links |

### DSP Enrichment

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/dsp/bio-sync` | POST | Better Auth | Sync bio to DSPs |
| `/api/dsp/bio-sync/status` | GET | Better Auth | Bio sync status |
| `/api/dsp/discover` | POST | Better Auth | Discover DSP profiles |
| `/api/dsp/enrichment/status` | GET | Better Auth | Enrichment job status |
| `/api/dsp/matches` | GET | Better Auth | List DSP matches |
| `/api/dsp/matches/[id]/confirm` | POST | Better Auth | Confirm DSP match |
| `/api/dsp/matches/[id]/reject` | POST | Better Auth | Reject DSP match |

### Email Tracking (pixel/redirect)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/email/track/click` | GET | Token | Track email link click |
| `/api/email/track/open` | GET | Token | Track email open (pixel) |

### Health

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | Public | Basic health check |
| `/api/health/auth` | GET | Better Auth | Auth system health |
| `/api/health/build-info` | GET | Public | Build metadata |
| `/api/health/comprehensive` | GET | Admin | Full system health |
| `/api/health/db` | GET | Admin | Database health |
| `/api/health/db/performance` | GET | Admin | DB performance metrics |
| `/api/health/deploy` | GET | Public | Deploy status |
| `/api/health/env` | GET | Admin | Environment info |
| `/api/health/homepage` | GET | Public | Homepage render check |
| `/api/health/keys` | GET | Admin | API key health |
| `/api/health/redis` | GET | Admin or CRON_SECRET | Redis write/read operability probe |

### Library Documents (authenticated creator)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/library/documents` | GET/POST | Better Auth | Cursor-page private documents or capture an idempotent idea |
| `/api/library/documents/[id]` | PATCH | Better Auth | Save an immutable rich-text revision with optimistic concurrency |
| `/api/library/documents/[id]/claims` | POST | Better Auth | Add evidence to the exact current revision |
| `/api/library/documents/[id]/review` | POST | Better Auth | Complete factual evidence review for a script |
| `/api/library/documents/[id]/approve` | POST | Owner | Approve and hand off the exact revision for capture |

### Images

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/images/artwork/upload` | POST | Better Auth | Upload release artwork |
| `/api/images/status/[id]` | GET | Better Auth | Image processing status |
| `/api/images/upload` | POST | Better Auth | Upload profile image |

### Insights (AI)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/insights` | GET | Better Auth | List AI insights |
| `/api/insights/[id]` | PATCH | Better Auth | Update insight |
| `/api/insights/generate` | POST | Better Auth | Generate new insights |
| `/api/insights/summary` | GET | Better Auth | Insights summary |

### Links

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/link/[id]` | POST | Better Auth | Create/update link |
| `/api/wrap-link` | POST/PUT/DELETE/GET | Better Auth | Manage wrapped links |

### Music Search

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/apple-music/search` | GET | Better Auth | Search Apple Music |
| `/api/spotify/search` | GET | Better Auth | Search Spotify |

### Notifications (fan-facing)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/notifications/confirm` | GET | Token | Confirm notification sub |
| `/api/notifications/preferences` | PATCH | Token | Update preferences |
| `/api/notifications/status` | POST | Public | Check subscription status |
| `/api/notifications/subscribe` | POST | Public | Subscribe to artist |
| `/api/notifications/unsubscribe` | POST | Token | Unsubscribe |
| `/api/notifications/verify-email-otp` | POST | Public | Verify email OTP |

### Pre-Save

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/pre-save/apple` | POST | Public | Apple Music pre-save |
| `/api/pre-save/spotify/callback` | GET | OAuth | Spotify pre-save callback |
| `/api/pre-save/spotify/start` | GET | Public | Start Spotify pre-save |

### Public / Misc

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/artist/theme` | POST | Better Auth | Update artist theme |
| `/api/calendar/[eventId]` | GET | Public | Get calendar event (.ics) |
| `/api/canvas/generate` | POST | Better Auth | Generate share canvas |
| `/api/create-tip-intent` | POST | Public | Create Stripe tip intent |
| `/api/creator` | GET | Better Auth | Get current creator profile |
| `/api/featured-creators` | GET | Public | Featured creators list |
| `/api/feedback` | POST | Better Auth | Submit feedback |
| `/api/max-access-request` | POST | Better Auth | Request Max plan features |
| `/api/handle/check` | GET | Better Auth | Check handle availability |
| `/api/ingestion/jobs` | POST | Better Auth | Trigger ingestion job |
| `/api/monitoring/performance` | GET | Admin | Performance metrics |
| `/api/profile/view` | POST | Public | Track profile view |
| `/api/px` | POST | Public | Tracking pixel |
| `/api/referrals/apply` | POST | Better Auth | Apply referral code |
| `/api/referrals/code` | GET/POST | Better Auth | Get/create referral code |
| `/api/referrals/stats` | GET | Better Auth | Referral stats |
| `/api/revalidate/featured-creators` | POST | Internal | Revalidate featured cache |
| `/api/suggestions` | GET | Better Auth | Profile suggestions |
| `/api/suggestions/avatars/[id]/dismiss` | POST | Better Auth | Dismiss avatar suggestion |
| `/api/suggestions/avatars/[id]/select` | POST | Better Auth | Select avatar suggestion |
| `/api/suggestions/social-links/[id]/approve` | POST | Better Auth | Approve social link |
| `/api/suggestions/social-links/[id]/reject` | POST | Better Auth | Reject social link |
| `/api/tips/create-checkout` | POST | Public | Create tip checkout |
| `/api/track` | POST | Public | Generic event tracking |
| `/api/unsubscribe/claim-invites` | GET/POST | Token | Unsubscribe from invites |
| `/api/waitlist` | GET/POST | Public | Waitlist signup |

### Webhooks (signature-verified)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/webhooks/linear` | POST | Linear sig | Linear issue sync |
| `/api/webhooks/resend` | POST/GET | Resend sig | Email delivery events |
| `/api/webhooks/sentry` | POST/GET | Sentry sig | Error alert events |
| `/api/webhooks/stripe-connect` | POST/GET | Stripe sig | Connect account events |
| `/api/webhooks/stripe-tips` | POST | Stripe sig | Tip payment events |

---

## 2. Reusable Utilities

### DSP Configuration

```typescript
import { DSP_CONFIGS, type DSPConfig } from '@/lib/dsp';
```

Platform metadata (name, color, logo SVG) for Spotify, Apple Music, SoundCloud, YouTube Music, Tidal, Deezer, Amazon Music, Pandora, and more. Used in profile pages, release smartlinks, and the provider matrix.

### TanStack Query Keys

```typescript
import { queryKeys } from '@/lib/queries/keys';
```

Hierarchical key factory with 21 domains: `billing`, `user`, `dashboard`, `creators`, `adminUsers`, `waitlist`, `profile`, `notifications`, `spotify`, `appleMusic`, `suggestions`, `dspEnrichment`, `releases`, `contacts`, `tourDates`, `handle`, `links`, `health`, `admin`, `campaign`, `insights`, `chat`, `audience`, `pixels`, `earnings`.

Use `queryKeys.domain.all` for broad invalidation, specific factories for targeted cache keys.

### Cache Strategy Presets

```typescript
import {
  REALTIME_CACHE,    // staleTime: 0 -- notifications, live feeds
  FREQUENT_CACHE,    // staleTime: 1min -- dashboard stats, billing
  STANDARD_CACHE,    // staleTime: 5min -- user profile, settings (default)
  STABLE_CACHE,      // staleTime: 15min -- feature flags, config
  STATIC_CACHE,      // staleTime: 1hr -- categories, platform lists
  PAGINATED_CACHE,   // staleTime: 5min, no refetch on mount -- infinite scroll
  SEARCH_CACHE,      // staleTime: 5min, no auto-refetch -- typeahead
} from '@/lib/queries/cache-strategies';
```

Spread into `useQuery` options. Every query MUST use one of these presets.

### Fetch Utilities

```typescript
import { fetchWithTimeout, FetchError } from '@/lib/queries/fetch';
import { createQueryFn, createMutationFn } from '@/lib/queries/fetch';
```

- `fetchWithTimeout<T>(url, options?)` -- fetch with configurable timeout (default 10s) and AbortSignal support
- `FetchError` -- typed error class with `status` and `response` properties
- `createQueryFn(url)` -- returns a queryFn that passes `signal` automatically
- `createMutationFn(url, method?)` -- returns a mutationFn for POST/PUT/DELETE

### Mutation Utilities

```typescript
import {
  handleMutationError,
  handleMutationSuccess,
  getErrorMessage,
} from '@/lib/queries/mutation-utils';
```

- `handleMutationError(error, fallback)` -- shows toast with user-friendly message, reports to Sentry
- `handleMutationSuccess(message)` -- shows success toast
- `getErrorMessage(error, fallback)` -- extracts safe error message (filters out stack traces and technical noise)

### Environment Variables

```typescript
import { env } from '@/lib/env';
```

Zod-validated env vars. Never use `process.env` directly.

### Route Constants

```typescript
import { APP_ROUTES } from '@/constants/routes';
```

Never hardcode route paths. Always import from here.

### App Constants

```typescript
import { /* ... */ } from '@/constants/app';
```

App-wide constants like `geoAwarePopularityIndex`, platform configs.

---

## 3. Component Reuse Patterns

### Shared UI (`packages/ui/atoms/`)

Core primitives that must be reused across all surfaces:

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `button.tsx` | All buttons (variants: default, secondary, ghost, outline, destructive) |
| `Input` | `input.tsx` | Text inputs |
| `Badge` | `badge.tsx` | Status/category badges |
| `Card` | `card.tsx` | Content cards |
| `Dialog` | `dialog.tsx` | Modal dialogs |
| `Sheet` | `sheet.tsx` | Slide-over panels |
| `DropdownMenu` | `dropdown-menu.tsx` | Dropdown menus |
| `ContextMenu` | `context-menu.tsx` | Right-click menus |
| `Popover` | `popover.tsx` | Floating content |
| `Select` | `select.tsx` | Select dropdowns |
| `Checkbox` | `checkbox.tsx` | Checkboxes |
| `RadioGroup` | `radio-group.tsx` | Radio inputs |
| `Switch` | `switch.tsx` | Toggle switches |
| `Tooltip` | `tooltip.tsx` | Hover tooltips |
| `SimpleTooltip` | `simple-tooltip.tsx` | Simplified tooltip wrapper |
| `TooltipShortcut` | `tooltip-shortcut.tsx` | Tooltip with keyboard shortcut |
| `Kbd` | `kbd.tsx` | Keyboard shortcut display |
| `Skeleton` | `skeleton.tsx` | Loading skeletons |
| `Separator` | `separator.tsx` | Visual separators |
| `SegmentControl` | `segment-control.tsx` | Tab-style segment controls |
| `AlertDialog` | `alert-dialog.tsx` | Confirmation dialogs |
| `Field` | `field.tsx` | Form field wrapper with label/error |
| `Form` | `form.tsx` | Form components (react-hook-form integration) |
| `Label` | `label.tsx` | Form labels |
| `Textarea` | `textarea.tsx` | Multi-line text inputs |
| `InputGroup` | `input-group.tsx` | Input with prefix/suffix addons |
| `CloseButton` | `close-button.tsx` | Standard close button |
| `CommonDropdown` | `common-dropdown.tsx` | Reusable dropdown pattern |
| `SearchableSubmenu` | `searchable-submenu.tsx` | Dropdown with search |

### App Components (`apps/web/components/`)

Organized by domain:

| Directory | Contains |
|-----------|----------|
| `dashboard/` | Dashboard shell, nav, header, organisms (audience table, release matrix, profile sidebar) |
| `home/` | Marketing page sections (hero, CTA, demos) |
| `profile/` | Public artist profile components |
| `jovie/` | AI chat components (SuggestedPrompts, chat hooks) |
| `admin/` | Admin panel components |
| `auth/` | Auth-related UI |
| `pricing/` | Pricing page components |
| `organisms/` | Complex shared components (DeferredSection, etc.) |
| `atoms/` | App-specific small components |
| `molecules/` | App-specific composite components |
| `providers/` | React context providers |
| `hooks/` | Shared React hooks |

### Key Dashboard Organisms

Located in `apps/web/components/dashboard/organisms/`:

- `dashboard-audience-table/` -- Audience table with filtering, pagination
- `release-provider-matrix/` -- Release x DSP provider grid
- `profile-contact-sidebar/` -- Contact detail sidebar panel

---

## 4. Database Patterns

### Schema Location

All Drizzle schema files: `apps/web/lib/db/schema/`

| File | Domain |
|------|--------|
| `profiles.ts` | Artist profiles, social links |
| `links.ts` | Profile links, wrapped links |
| `content.ts` | Releases, tracks, tour dates |
| `billing.ts` | Subscriptions, Stripe data |
| `auth.ts` | Users, roles, sessions |
| `analytics.ts` | Page views, click events |
| `chat.ts` | Chat conversations, messages |
| `insights.ts` | AI-generated insights |
| `dsp-enrichment.ts` | DSP match candidates |
| `dsp-bio-sync.ts` | Bio sync jobs |
| `email-engagement.ts` | Email opens, clicks |
| `feedback.ts` | User feedback |
| `ingestion.ts` | Ingestion jobs queue |
| `leads.ts` | Sales leads |
| `pixels.ts` | Ad tracking pixels |
| `pre-save.ts` | Pre-save records |
| `referrals.ts` | Referral codes, claims |
| `tip-audience.ts` | Tips and tipping audience |
| `tour.ts` | Tour dates, calendar events |
| `waitlist.ts` | Waitlist entries |
| `admin.ts` | Admin-specific tables |
| `audit.ts` | Audit log |
| `enums.ts` | Shared Postgres enums |
| `sender.ts` | Email sender identity |
| `suppression.ts` | Email suppression list |
| `index.ts` | Barrel export of all schemas |

### Database Client

```typescript
import { db } from '@/lib/db';
```

This is the ONLY valid import for database access. Uses `@neondatabase/serverless` WebSocket driver with a client-side Pool for stateful RLS connections.

### Query Patterns

```typescript
// Select with conditions
const profiles = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId));

// Insert (batch)
await db.insert(links).values([{ url, title, profileId }, ...]);

// Update
await db.update(profiles).set({ bio: newBio }).where(eq(profiles.id, profileId));

// Delete
await db.delete(links).where(eq(links.id, linkId));

// Relational queries
const profile = await db.query.profiles.findFirst({
  where: eq(profiles.handle, handle),
  with: { links: true, socialLinks: true },
});
```

### Server-Side Query Library

Reusable DB query functions: `apps/web/lib/db/queries/`

Import these instead of writing ad-hoc queries. Each file covers a domain (analytics, profiles, releases, etc.).

### Migrations

- Location: `drizzle/migrations/` (IMMUTABLE -- never edit existing migrations)
- Generate: `pnpm --filter web drizzle:generate`
- Apply: `pnpm --filter web drizzle:migrate`
- Studio: `pnpm --filter web drizzle:studio`

### Forbidden Patterns

- No `db.transaction()` (requires explicit approval; use approved RLS wrappers)
- No `import { Pool } from 'pg'` (use `db` from `@/lib/db`)
- No per-row insert loops (use batch `db.insert().values([...])`)

---

## 5. Key Constants and Type Exports

### Types (`apps/web/types/`)

| File | Exports |
|------|---------|
| `db.ts` | `Artist`, `Release`, `Link`, `SocialLink`, `Profile` and other DB row types |
| `index.ts` | `UserPlan`, `UserEntitlements`, shared contracts |
| `analytics.ts` | Analytics event types |
| `audience.ts` | Audience member/subscriber types |
| `contact.ts` / `contacts.ts` | Contact record types |
| `dashboard.ts` | Dashboard data types |
| `links.ts` | Link and wrapped link types |
| `notifications.ts` | Notification types |
| `insights.ts` | AI insight types |
| `common.ts` | Shared utility types |
| `hud.ts` | HUD overlay types |

### Constants (`apps/web/constants/`)

| File | Exports |
|------|---------|
| `app.ts` | `geoAwarePopularityIndex`, app-wide config |
| `routes.ts` | `APP_ROUTES` -- all route path constants |
| `platforms.ts` | Platform name/logo/URL mappings |
| `domains.ts` | Domain configuration |

### DSP Library (`apps/web/lib/dsp.ts`)

```typescript
import { DSP_CONFIGS, type DSPConfig, type DevicePlatform } from '@/lib/dsp';
```

Platform metadata for all supported DSPs. Also exports helpers for building platform-specific URLs and device-aware link ordering.

### Entitlements (`apps/web/lib/entitlements/`)

```typescript
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
```

Single source of truth for plan capabilities. See `AGENTS.md` section 8 for rules.

### Environment (`apps/web/lib/env.ts`)

```typescript
import { env } from '@/lib/env';
```

Zod-validated environment variables. Never use `process.env` directly.

---

## 6. Conventions Reference

For the full set of enforced rules, see [`AGENTS.md`](../AGENTS.md). Key points:

- **Node 22 + pnpm 9.15.4** -- verify before any command
- **Monorepo commands from root** -- `pnpm --filter web ...`, never `cd apps/web`
- **Server/client boundaries** -- no DB imports in `'use client'` files
- **No `db.transaction()`** -- requires explicit approval; use approved RLS wrappers
- **No emoji in UI** -- use SVG icons
- **Conventional commits** -- `type(scope): description`
- **PR size limits** -- max 10 files, 400 lines diff
- **Pre-push gate** -- `scripts/hooks/pre-push-gate.sh` (husky + [no-mistakes OWL pilot](NO_MISTAKES_GATE.md)); escape: `JOVIE_SKIP_PRE_PUSH_GATE=1`
- **Static marketing pages** -- no per-request data in `app/(marketing)`
- **TanStack Query** -- always use cache presets, always pass AbortSignal
- **Route constants** -- import `APP_ROUTES`, never hardcode paths
