# Jovie Feature Gaps Audit

> Comprehensive analysis of missing UI surfaces, CRUD asymmetries, edge cases, and critical feature gaps across the Jovie platform.

---

## Critical Severity

Issues that represent compliance risks, data loss potential, or fundamentally broken user flows.

### 1. No User-Facing Account Deletion

- **Impact**: Users cannot delete their own account. Only admins can via `DeleteCreatorDialog`.
- **GDPR Risk**: Violates right to erasure (Article 17).
- **Location**: Missing from `AccountSettingsSection` in settings.
- **Fix**: Add a "Danger Zone" section in account settings with delete confirmation flow.

### 2. No Data Export (GDPR Data Portability)

- **Impact**: No way for users to export their profile, analytics, subscriber, or payment data.
- **GDPR Risk**: Violates right to data portability (Article 20).
- **Fix**: Add data export endpoint and UI button in account settings.

### 3. Tips Are Create-Only (No Visibility or Management)

- **Impact**: Creators receive tips via Stripe but have **no UI to view tip history, amounts, or manage refunds**.
- **Backend**: `POST /api/create-tip-intent` and `POST /api/capture-tip` exist. The `tips` table stores records.
- **Missing**: No read endpoint for creators. No dashboard widget. No earnings breakdown by tip.
- **Fix**: Add tip history view in `/app/dashboard/earnings` or `/app/dashboard/tipping` (page route exists but may be empty).

### 4. Email Subscriptions Have No Verification Step

- **Impact**: Anyone can subscribe any email address without confirmation. Spam/abuse vector.
- **Location**: `POST /api/notifications/subscribe` accepts email directly; fan sees "Notifications enabled" immediately.
- **Also**: Unsubscribe endpoint accepts ANY email with no verification.
- **Fix**: Implement double opt-in (confirmation email before activation).

### 5. No Password Change or 2FA UI

- **Impact**: No UI for password management or two-factor authentication setup.
- **Status**: Clerk supports both features, but neither is surfaced in the Jovie settings UI.
- **Fix**: Embed Clerk's `<UserProfile />` component or build custom forms for password/2FA.

### 6. No Connected OAuth Account Management

- **Impact**: Users who sign in via Spotify/Google OAuth cannot see or disconnect their connected providers.
- **Fix**: Add connected accounts card to account settings using Clerk's connected accounts API.

---

## High Severity

Features with significant asymmetries that frustrate users or block core workflows.

### 7. Music Links Cannot Be Deleted

- **Impact**: Once a music/listen link is added (Spotify, Apple Music, etc.), it **cannot be removed**.
- **Backend**: `PUT/PATCH /api/dashboard/social-links` handles add/edit. No DELETE for music link types.
- **UI**: `ListenNowForm` has add/edit but no remove button.
- **Fix**: Add delete action to music links, mirroring social links' soft-delete pattern.

### 8. Releases Cannot Be Created or Deleted

- **Impact**: Discography is **read-only from Spotify sync**. Creators cannot manually add releases or hide/remove unwanted ones.
- **Backend**: Only `saveProviderOverride()` and `resetProviderOverride()` exist (edit provider links).
- **Fix**: Add manual release creation + hide/delete capability. Critical for artists not on Spotify.

### 9. Pixel Configs Cannot Be Deleted

- **Impact**: Once Facebook/Google/TikTok pixel tokens are configured, they **cannot be cleared or removed**.
- **Backend**: `PUT /api/dashboard/pixels` is upsert-only.
- **Fix**: Add delete/clear action for pixel configurations.

### 10. Profile Visibility Toggle Missing

- **Impact**: The `is_public` field exists in `creator_profiles` schema, but **no UI toggle** allows creators to make their profile private, draft, or temporarily unpublish.
- **Location**: Missing from `SettingsArtistProfileSection`.
- **Related**: A private profile shows as 404 with no "this profile is private" message.

### 11. Audience Members Are Read-Only

- **Impact**: Creators can view audience members but **cannot delete, block, or manage** them.
- **Backend**: No update or delete operations for `audience_members`.
- **Related Gaps**:
  - Audience tags exist in schema but no UI to view/create/manage them.
  - Engagement scores are sortable but not displayed in the table.
  - Intent levels only appear in the detail sidebar, not the main list.

### 12. Notification Subscribers Cannot Be Managed by Creators

- **Impact**: Fans can subscribe/unsubscribe, but creators **cannot remove, export, or segment** their subscriber list.
- **Backend**: `GET /api/dashboard/audience/subscribers` is read-only.
- **Fix**: Add subscriber management actions (remove, export, segment).

### 13. Wrapped Links Are Create-Only

- **Impact**: `POST /api/wrap-link` creates wrapped links, but UPDATE and DELETE both return 405 Method Not Allowed.
- **Fix**: Allow users to deactivate or delete wrapped links.

### 14. Subscription Cancellation Is External-Only

- **Impact**: Cancellation requires leaving the app to Stripe's billing portal. No in-app confirmation flow, no reason collection, no retention offer, no downgrade warnings.
- **Fix**: Build in-app cancellation flow with feature-loss warnings before redirecting to Stripe.

---

## Medium Severity

Missing UI for backend features, incomplete settings, and UX gaps.

### 15. Entire DSP Feature Suite Has No Creator UI

The following DSP-related features have full backend implementations but **zero user-facing UI**:

| Feature | Backend | UI |
|---------|---------|-----|
| **Bio Sync** (push bio to DSPs) | `dspBioSyncRequests` table + API | None |
| **Enrichment Data** (genres, popularity, images from DSPs) | `dspArtistEnrichment` table + API | None |
| **Artist Matches** (cross-platform matching) | `dspArtistMatches` table + confirm/reject APIs | None |
| **Discovery** (find new profiles) | `/api/dsp/discover` | None |
| **Social Link Suggestions** (auto-detected links) | `socialLinkSuggestions` table | None |
| **Avatar Candidates** (suggested profile images) | `creatorAvatarCandidates` table | None |

**Fix**: Build a "DSP Hub" dashboard section where creators can:
- View and confirm/reject artist matches across platforms
- See and apply enrichment data (genres, images, bios)
- Accept/reject suggested social links and avatar candidates
- Trigger bio sync to connected platforms

### 16. Email/Campaign System Has No Creator UI

| Feature | Backend | UI |
|---------|---------|-----|
| **Campaign Creation** | `campaignSequences` + `campaignEnrollments` tables | Admin-only |
| **Email Engagement** (opens, clicks) | `emailEngagement` table | None |
| **Email Suppression List** (bounces, complaints) | `emailSuppressions` table | None |
| **Notification Delivery Log** | `notificationDeliveryLog` table | None |
| **Sending Quotas** | `creatorEmailQuotas` table | None |
| **Sending Reputation** | `creatorSendingReputation` table | None |
| **Release Notification Config** | `fanReleaseNotifications` table | None |

**Fix**: Build email campaign management UI and an email analytics dashboard for creators.

### 17. Creator Notification Preferences Are Minimal

- **Current**: Only a single "marketing emails" toggle in settings.
- **Missing**: Per-type controls (new tips, new followers, weekly digests, release reminders), frequency settings.

### 18. Billing History Not Visible

- **Impact**: `billingAuditLog` table tracks subscription state changes but is **not exposed** in the billing UI.
- **Fix**: Add billing history/invoice list to settings billing section.

### 19. Profile Attribute History Not Visible

- **Impact**: `creatorProfileAttributes` table tracks changes over time but has no history/timeline UI.

### 20. Waitlist Entries Cannot Be Deleted by Admins

- **Impact**: Waitlist entries accumulate permanently. No cleanup mechanism for admins.

### 21. Admin Campaigns Cannot Be Edited or Deleted

- **Impact**: Once created, admin invite campaigns have no edit or delete capability.

---

## Low Severity

Edge cases and polish items.

### 22. Tour Date Timezone Gaps

- Tour date cards show time without timezone context. No conversion from venue timezone to user timezone.

### 23. Empty State Messaging Gaps

- **No social links**: Section silently hides instead of showing helpful empty state.
- **No music links**: "Listen now" CTA may be disabled with no explanation.
- **Private profile**: Shows as generic 404 with no "this profile is private" message.

### 24. Tipping Edge Cases

- Tip amount clamped to $1-$500 silently; no UI messaging about limits.
- Authentication required but unauthenticated users see no clear guidance.
- Payment failures are silent (webhook returns 500, user sees nothing).

### 25. SEO/Social Sharing Gaps

- OG image falls back to undefined when creator has no avatar (no fallback image).
- Bio truncated to 120 chars for meta description without indication.

### 26. Cookie Consent Not Re-Accessible

- `CookieModal` appears on initial visit but cannot be re-opened from settings.
- **Fix**: Add "Manage Cookie Preferences" link in settings or footer.

### 27. Mobile Layout Edge Cases

- Avatar size hardcoded to XL on all breakpoints.
- Social bar overflow possible with many links on mobile.
- Tour date cards don't shrink date box on small screens.

---

## Summary Matrix

| # | Gap | Severity | Category |
|---|-----|----------|----------|
| 1 | No account deletion | Critical | Compliance |
| 2 | No data export | Critical | Compliance |
| 3 | Tips are create-only | Critical | CRUD |
| 4 | No email verification on subscribe | Critical | Security |
| 5 | No password/2FA UI | Critical | Security |
| 6 | No OAuth account management | Critical | Settings |
| 7 | Music links can't be deleted | High | CRUD |
| 8 | Releases can't be created/deleted | High | CRUD |
| 9 | Pixel configs can't be deleted | High | CRUD |
| 10 | No profile visibility toggle | High | Settings |
| 11 | Audience is read-only | High | CRUD |
| 12 | Subscribers can't be managed | High | CRUD |
| 13 | Wrapped links are create-only | High | CRUD |
| 14 | Cancellation is external-only | High | Billing |
| 15 | DSP features have no UI | Medium | Missing UI |
| 16 | Email/campaigns have no creator UI | Medium | Missing UI |
| 17 | Notification preferences minimal | Medium | Settings |
| 18 | Billing history not visible | Medium | Missing UI |
| 19 | Profile history not visible | Medium | Missing UI |
| 20 | Waitlist entries undeletable | Medium | Admin |
| 21 | Admin campaigns undeletable | Medium | Admin |
| 22 | Tour date timezone gaps | Low | UX |
| 23 | Empty state messaging gaps | Low | UX |
| 24 | Tipping edge cases | Low | UX |
| 25 | SEO/social sharing gaps | Low | UX |
| 26 | Cookie consent not re-accessible | Low | Compliance |
| 27 | Mobile layout edge cases | Low | UX |
