# AI Agent Developer Guide

Quick-reference for AI agents working in the Jovie codebase. For hard guardrails and enforcement rules, see [`AGENTS.md`](../AGENTS.md).

---

## 1. API Route Inventory

All routes live under `apps/web/app/api/`. Auth is via Clerk (`auth()`) unless noted.

### Account

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/account/delete` | POST | Clerk | Delete user account |
| `/api/account/email` | POST | Clerk | Update account email |
| `/api/account/export` | GET | Clerk | Export user data (GDPR) |

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
| `/api/billing/health` | GET | Clerk | Billing system health |
| `/api/billing/history` | GET | Clerk | Invoice history |
| `/api/billing/status` | GET | Clerk | Current billing status |
| `/api/stripe/cancel` | POST/GET | Clerk | Cancel subscription |
| `/api/stripe/checkout` | POST/GET | Clerk | Create checkout session |
| `/api/stripe/plan-change` | POST/GET/DELETE | Clerk | Change/preview/cancel plan |
| `/api/stripe/plan-change/preview` | POST/GET | Clerk | Preview plan change cost |
| `/api/stripe/portal` | POST/GET | Clerk | Stripe customer portal |
| `/api/stripe/pricing-options` | GET | Public | Available pricing tiers |
| `/api/stripe/webhooks` | POST/GET | Stripe sig | Stripe webhook handler |
| `/api/stripe-connect/disconnect` | POST | Clerk | Disconnect Stripe Connect |
| `/api/stripe-connect/onboard` | POST | Clerk | Start Connect onboarding |
| `/api/stripe-connect/return` | GET | Clerk | Connect onboarding return |
| `/api/stripe-connect/status` | GET | Clerk | Connect account status |

### Chat (Jovie AI)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/chat` | POST | Clerk | Send chat message (streaming) |
| `/api/chat/confirm-edit` | POST | Clerk | Confirm AI-suggested edit |
| `/api/chat/confirm-link` | POST | Clerk | Confirm AI-suggested link |
| `/api/chat/confirm-remove-link` | POST | Clerk | Confirm link removal |
| `/api/chat/conversations` | GET | Clerk | List conversations |
| `/api/chat/conversations/[id]` | GET | Clerk | Get conversation |
| `/api/chat/conversations/[id]/messages` | GET | Clerk | Get conversation messages |
| `/api/chat/usage` | GET | Clerk | Chat usage stats |

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

### Dashboard (authenticated creator)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/dashboard/activity/recent` | GET | Clerk | Recent activity feed |
| `/api/dashboard/analytics` | GET | Clerk | Analytics data |
| `/api/dashboard/audience/members` | GET | Clerk | Audience members list |
| `/api/dashboard/audience/subscribers` | GET | Clerk | Email subscribers list |
| `/api/dashboard/earnings` | GET | Clerk | Earnings/tips data |
| `/api/dashboard/pixels` | GET/POST | Clerk | Ad pixel settings |
| `/api/dashboard/profile` | GET | Clerk | Dashboard profile data |
| `/api/dashboard/releases/[releaseId]/analytics` | GET | Clerk | Release analytics |
| `/api/dashboard/releases/[releaseId]/tracks` | GET | Clerk | Release tracks |
| `/api/dashboard/social-links` | GET | Clerk | Social links |

### DSP Enrichment

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/dsp/bio-sync` | POST | Clerk | Sync bio to DSPs |
| `/api/dsp/bio-sync/status` | GET | Clerk | Bio sync status |
| `/api/dsp/discover` | POST | Clerk | Discover DSP profiles |
| `/api/dsp/enrichment/status` | GET | Clerk | Enrichment job status |
| `/api/dsp/matches` | GET | Clerk | List DSP matches |
| `/api/dsp/matches/[id]/confirm` | POST | Clerk | Confirm DSP match |
| `/api/dsp/matches/[id]/reject` | POST | Clerk | Reject DSP match |

### Email Tracking (pixel/redirect)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/email/track/click` | GET | Token | Track email link click |
| `/api/email/track/open` | GET | Token | Track email open (pixel) |

### Health

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | Public | Basic health check |
| `/api/health/auth` | GET | Clerk | Auth system health |
| `/api/health/build-info` | GET | Public | Build metadata |
| `/api/health/comprehensive` | GET | Admin | Full system health |
| `/api/health/db` | GET | Admin | Database health |
| `/api/health/db/performance` | GET | Admin | DB performance metrics |
| `/api/health/deploy` | GET | Public | Deploy status |
| `/api/health/env` | GET | Admin | Environment info |
| `/api/health/homepage` | GET | Public | Homepage render check |
| `/api/health/keys` | GET | Admin | API key health |
| `/api/health/redis` | GET | Admin | Redis health |

### Images

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/images/artwork/upload` | POST | Clerk | Upload release artwork |
| `/api/images/status/[id]` | GET | Clerk | Image processing status |
| `/api/images/upload` | POST | Clerk | Upload profile image |

### Insights (AI)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/insights` | GET | Clerk | List AI insights |
| `/api/insights/[id]` | PATCH | Clerk | Update insight |
| `/api/insights/generate` | POST | Clerk | Generate new insights |
| `/api/insights/summary` | GET | Clerk | Insights summary |

### Links

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/link/[id]` | POST | Clerk | Create/update link |
| `/api/wrap-link` | POST/PUT/DELETE/GET | Clerk | Manage wrapped links |

### Music Search

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/apple-music/search` | GET | Clerk | Search Apple Music |
| `/api/spotify/search` | GET | Clerk | Search Spotify |

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
| `/api/artist/theme` | POST | Clerk | Update artist theme |
| `/api/calendar/[eventId]` | GET | Public | Get calendar event (.ics) |
| `/api/canvas/generate` | POST | Clerk | Generate share canvas |
| `/api/capture-tip` | POST | Public | Capture tip payment |
| `/api/create-tip-intent` | POST | Public | Create Stripe tip intent |
| `/api/creator` | GET | Clerk | Get current creator profile |
| `/api/featured-creators` | GET | Public | Featured creators list |
| `/api/feedback` | POST | Clerk | Submit feedback |
| `/api/growth-access-request` | POST | Clerk | Request growth features |
| `/api/handle/check` | GET | Clerk | Check handle availability |
| `/api/ingestion/jobs` | POST | Clerk | Trigger ingestion job |
| `/api/monitoring/performance` | GET | Admin | Performance metrics |
| `/api/profile/view` | POST | Public | Track profile view |
| `/api/px` | POST | Public | Tracking pixel |
| `/api/referrals/apply` | POST | Clerk | Apply referral code |
| `/api/referrals/code` | GET/POST | Clerk | Get/create referral code |
| `/api/referrals/stats` | GET | Clerk | Referral stats |
| `/api/revalidate/featured-creators` | POST | Internal | Revalidate featured cache |
| `/api/suggestions` | GET | Clerk | Profile suggestions |
| `/api/suggestions/avatars/[id]/dismiss` | POST | Clerk | Dismiss avatar suggestion |
| `/api/suggestions/avatars/[id]/select` | POST | Clerk | Select avatar suggestion |
| `/api/suggestions/social-links/[id]/approve` | POST | Clerk | Approve social link |
| `/api/suggestions/social-links/[id]/reject` | POST | Clerk | Reject social link |
| `/api/tips/create-checkout` | POST | Public | Create tip checkout |
| `/api/track` | POST | Public | Generic event tracking |
| `/api/unsubscribe/claim-invites` | GET/POST | Token | Unsubscribe from invites |
| `/api/waitlist` | GET/POST | Public | Waitlist signup |

### Webhooks (signature-verified)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/clerk/webhook` | POST | Svix sig | Clerk user events |
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

This is the ONLY valid import for database access. Uses `@neondatabase/serverless` HTTP driver with Neon's built-in connection pooling.

### Query Patterns

```typescript
// Select with conditions
const users = await db.select().from(profiles).where(eq(profiles.clerkUserId, clerkId));

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

- No `db.transaction()` (Neon HTTP driver incompatible)
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
- **No `db.transaction()`** -- Neon HTTP driver limitation
- **No emoji in UI** -- use SVG icons
- **Conventional commits** -- `type(scope): description`
- **PR size limits** -- max 10 files, 400 lines diff
- **Pre-push gate** -- typecheck, lint, test, boundaries check
- **Static marketing pages** -- no per-request data in `app/(marketing)`
- **TanStack Query** -- always use cache presets, always pass AbortSignal
- **Route constants** -- import `APP_ROUTES`, never hardcode paths
