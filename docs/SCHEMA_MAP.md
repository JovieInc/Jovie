# Database Schema Map

> **Question this answers:** "Which schema file defines this table? What are the key relationships?"

All schema files live in `apps/web/lib/db/schema/`. Import tables and types from `@/lib/db/schema` (the barrel export in `index.ts`).

## Schema Files by Domain

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
| `tip-audience.ts` | `tipAudience` | Tracks fan engagement from tips |

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

### Billing

| Schema File | Tables | Key Relations |
|-------------|--------|---------------|
| `billing.ts` | `stripeWebhookEvents`, `billingAuditLog` | `stripeWebhookEvents` used for webhook idempotency |

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

All database enums are defined in `enums.ts`. There are 60+ enums covering statuses, types, and categories across all domains. Always import enums from `@/lib/db/schema` — never redefine enum values in application code.

## Adding a New Table

1. Create or update the appropriate domain schema file in `apps/web/lib/db/schema/`
2. Add named re-exports to `apps/web/lib/db/schema/index.ts` (follow existing alphabetical pattern)
3. Run `pnpm --filter web drizzle:generate` to create the migration SQL
4. See [DB_MIGRATIONS.md](DB_MIGRATIONS.md) for migration rules (migrations are immutable once committed)
