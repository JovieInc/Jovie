# Database Schema Map

> **Question this answers:** "Which schema file defines this table? What are the key relationships?"

All schema files live in `apps/web/lib/db/schema/`. Import tables and types from `@/lib/db/schema` (the barrel export in `index.ts`).

## Schema Files by Domain

### Agent Registry & Retouching

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `agents.ts` | `skills_catalog`, `skills_catalog_versions`, `skill_run_events`, `tools_catalog`, `retouch_jobs` | `skills_catalog.id` is the slug PK (e.g. `retouch`) with `lifecycle` + `active_version`; version history in `skills_catalog_versions (skill_id, version)`; per-invocation telemetry in `skill_run_events.invocation_id` (unique); `tools_catalog.id` same shape; `retouch_jobs.userId` → `users` cascade |

**Sync:** `skills_catalog` and `tools_catalog` are upserted from `SKILL_REGISTRY` at deploy time by `apps/web/scripts/sync-skills-catalog.ts` (wired into `postbuild`). Do not hand-edit these rows.

**Enums:** `skillKindEnum` (`vertical_agent`, `tool`, `style`); `retouchJobStatusEnum` (`queued`, `running`, `identity_check_failed`, `identity_check_retrying`, `completed`, `failed`, `rejected_by_user`, `accepted_by_user`).

**Indexes on `retouch_jobs`:**
- `(userId, status, startedAt desc)` — per-user status feed + daily budget check
- `(status, startedAt desc)` — cron sweeper (GC rejected results, stale running jobs)

### AI Connectors (v1)

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `connectors.ts` | `connectorAccounts`, `connectorSyncStates`, `externalObjects`, `webhookDeliveries`, `contextFacts`, `agentRuns`, `suggestedActions`, `workflowRuns` | `connectorAccounts.userId` → `users`; `connectorSyncStates.connectorAccountId` → `connectorAccounts`; `contextFacts.userId` → `users`; `suggestedActions.agentRunId` → `agentRuns` |

Token read/write must go through `apps/web/lib/connectors/token-vault.ts` — never write `encryptedAccessToken`/`encryptedRefreshToken` directly.

### Identity & Access

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `auth.ts` | `users`, `userSettings` | `users.id` is the FK target for most tables via `clerkUserId` |
| `profiles.ts` | `creatorProfiles`, `creatorClaimInvites`, `creatorContacts`, `creatorProfileAttributes`, `creatorAvatarCandidates`, `profilePhotos`, `profileOwnershipLog`, `userProfileClaims` | `creatorProfiles.clerkUserId` → `users`; `userProfileClaims` links users to profiles |
| `waitlist.ts` | `waitlistEntries`, `waitlistInvites`, `waitlistSettings` | `waitlistEntries.clerkUserId` → `users` |

### Content & Music

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `content.ts` | `artists`, `providers`, `providerLinks`, `smartLinkTargets`, `discogReleases`, `discogRecordings`, `discogTracks`, `discogReleaseTracks`, `recordingArtists`, `releaseArtists`, `trackArtists`, `contentSlugRedirects` | `providerLinks.providerId` → `providers`; artist junction tables link to `artists` |
| `dsp-enrichment.ts` | `dspArtistMatches`, `fanReleaseNotifications`, `socialLinkSuggestions` | `dspArtistMatches.creatorProfileId` → `creatorProfiles` |
| `dsp-bio-sync.ts` | `dspBioSyncRequests` | `dspBioSyncRequests.creatorProfileId` → `creatorProfiles` |
| `release-tasks.ts` | `releaseTasks`, `releaseTaskTemplates`, `releaseTaskTemplateItems` | `releaseTasks.releaseId` → `discogReleases` |
| `pre-save.ts` | `preSaveTokens` | Links fans to upcoming releases |
| `tour.ts` | `tourDates` | `tourDates.creatorProfileId` → `creatorProfiles` |

### Analytics & Tracking

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `analytics.ts` | `clickEvents`, `audienceMembers`, `tips`, `notificationSubscriptions`, `dailyProfileViews` | `clickEvents.providerLinkId` → `providerLinks`; `tips.creatorProfileId` → `creatorProfiles` |
| `pixels.ts` | `creatorPixels`, `pixelEvents` | `creatorPixels.creatorProfileId` → `creatorProfiles`; `pixelEvents.creatorPixelId` → `creatorPixels` |
| `insights.ts` | `aiInsights`, `insightGenerationRuns` | `aiInsights.creatorProfileId` → `creatorProfiles` |
| `ai-crawler-analytics.ts` | `aiCrawlerAnalyticsSnapshots` | `creatorProfileId` → `creatorProfiles`; 30-day Cloudflare AI-crawl aggregates per profile |
| `tip-audience.ts` | `tipAudience` | Tracks fan engagement from tips |
| `revenue-cohorts.ts` | `artistRevenueCohorts` | `userId` → `users` cascade; `creatorProfileId` → `creatorProfiles` set null; IRPAA cohort tag (`jovie_active`/`control`) + immutable 30-day pre-Jovie revenue baseline (gh-12141) |

### Communication & Email

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `email-engagement.ts` | `emailEngagement`, `campaignSequences`, `campaignEnrollments` | `campaignEnrollments.creatorProfileId` → `creatorProfiles` |
| `suppression.ts` | `emailSuppressions`, `webhookEvents`, `notificationDeliveryLog`, `unsubscribeTokens`, `categorySubscriptions` | `emailSuppressions` keyed by email address |
| `sender.ts` | `creatorEmailQuotas`, `creatorSendingReputation`, `emailSendAttribution` | `creatorEmailQuotas.creatorProfileId` → `creatorProfiles` |
| `inbox.ts` | `emailThreads`, `inboundEmails`, `outboundReplies` | `emailThreads.creatorProfileId` → `creatorProfiles` |

### Links & Social

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `links.ts` | `socialLinks`, `socialAccounts`, `wrappedLinks`, `signedLinkAccess`, `dashboardIdempotencyKeys` | `socialLinks.creatorProfileId` → `creatorProfiles` |

### Wallet

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `wallet.ts` | `appleWalletProfilePasses`, `appleWalletPassDevices`, `appleWalletPassRegistrations` | Profile passes belong to `creatorProfiles` and reuse `audienceSourceLinks`; registrations join passes to Wallet device library IDs for update pushes |

### Billing

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `billing.ts` | `stripeWebhookEvents`, `billingAuditLog` | `stripeWebhookEvents` used for webhook idempotency |

### Merch

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `merch.ts` | `merchGenerationBatches`, `merchDesignOptions`, `merchCards`, `merchOrders`, `merchPayoutLedgerEntries`, `merchFulfillmentJobs` | All rows belong to `creatorProfiles`; selected design options become Jovie-owned merch cards; paid orders enqueue fulfillment jobs and accrue manual payout ledger entries |

`merchCards` are the storefront/business source of truth. Printful IDs, variant maps, placements, print files, mockups, pricing snapshots, learning signals, and performance counters are stored on the Jovie card/order rows. Printful webhook idempotency uses `webhookEvents`; Stripe merch payment idempotency uses order/session/payment IDs plus the separate merch webhook route and a durable `stripeWebhookEvents.processingStartedAt` claim.

### Admin & Growth

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `admin.ts` | `adminAuditLog`, `campaignSettings` | Admin-scoped, no user FK |
| `leads.ts` | `leads`, `discoveryKeywords`, `leadPipelineSettings` | `leads` track prospective creators |
| `ingestion.ts` | `ingestionJobs`, `scraperConfigs` | `ingestionJobs` track profile import pipeline |
| `audit.ts` | `ingestAuditLogs` | Audit trail for ingestion operations |
| `feedback.ts` | `feedbackItems` | `feedbackItems.clerkUserId` → `users` |

### Chat

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `chat.ts` | `chatConversations`, `chatMessages`, `chatAuditLog` | `chatConversations.clerkUserId` → `users` |

### Investors

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `investors.ts` | `investorLinks`, `investorSettings`, `investorViews` | Standalone investor portal tables |

### Referrals

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `referrals.ts` | `referralCodes`, `referrals`, `referralCommissions` | `referralCodes.creatorProfileId` → `creatorProfiles` |

### Product Updates

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `product-update-subscribers.ts` | `productUpdateSubscribers` | Changelog email subscribers |

## Enums

All database enums are defined in `enums.ts`. There are 70+ enums covering statuses, types, and categories across all domains. Always import enums from `@/lib/db/schema` — never redefine enum values in application code.

## Adding a New Table

1. Create or update the appropriate domain schema file in `apps/web/lib/db/schema/`
2. Add named re-exports to `apps/web/lib/db/schema/index.ts` (follow existing alphabetical pattern)
3. Run `pnpm --filter web drizzle:generate` to create the migration SQL
4. See [DB_MIGRATIONS.md](DB_MIGRATIONS.md) for migration rules (migrations are immutable once committed)
