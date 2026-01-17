# Notification Suppression & Management System - Long-Term Plan

> **Status:** Planning Document (Not Yet Implemented)
> **Created:** 2026-01-17
> **Owner:** Engineering Team

## Executive Summary

This document outlines the complete architecture for Jovie's notification suppression, categorization, and preference management system. The goal is to build a production-grade, compliance-ready notification infrastructure that handles bounces, spam complaints, global/per-artist suppression, and multi-channel preferences.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1: Global Suppression List](#3-phase-1-global-suppression-list)
4. [Phase 2: Bounce & Complaint Handling](#4-phase-2-bounce--complaint-handling)
5. [Phase 3: Notification Categories & Granular Unsubscribe](#5-phase-3-notification-categories--granular-unsubscribe)
6. [Phase 4: Multi-Channel Support](#6-phase-4-multi-channel-support)
7. [Phase 5: Dashboard Notification Settings](#7-phase-5-dashboard-notification-settings)
8. [Database Schema](#8-database-schema)
9. [API Design](#9-api-design)
10. [Compliance Requirements](#10-compliance-requirements)
11. [Implementation Milestones](#11-implementation-milestones)

---

## 1. Current State Analysis

### What Exists Today

| Component | Status | Location |
|-----------|--------|----------|
| Email Provider | Resend | `lib/notifications/providers/resend.ts` |
| Subscription Storage | Per-artist subscriptions | `notification_subscriptions` table |
| Per-Artist Unsubscribe | Soft-delete via `unsubscribedAt` | `lib/notifications/domain.ts` |
| Creator Preferences | JSON in `creatorProfiles.notificationPreferences` | `lib/notifications/preferences.ts` |
| Subscriber Preferences | JSON in `notificationSubscriptions.preferences` | Per-subscription |
| Release Notification Queue | Pending/scheduled/sent states | `fan_release_notifications` table |

### Critical Gaps

| Gap | Risk Level | Impact |
|-----|------------|--------|
| No bounce handling | **CRITICAL** | Continued sending to invalid addresses hurts deliverability |
| No spam complaint handling | **CRITICAL** | Legal exposure (CAN-SPAM, GDPR) |
| No global suppression list | **HIGH** | Cannot track globally blocked addresses |
| No webhook integration | **HIGH** | Resend events not captured |
| No category-level unsubscribe | **MEDIUM** | Users cannot unsubscribe from "all artists" |
| No preference dashboard for fans | **MEDIUM** | No self-service management |

---

## 2. Architecture Overview

### Core Concepts

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION SUPPRESSION SYSTEM                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │   GLOBAL    │     │    PER-ARTIST   │     │   PER-CATEGORY  │   │
│  │ SUPPRESSION │     │  SUBSCRIPTION   │     │   SUBSCRIPTION  │   │
│  │             │     │                 │     │                 │   │
│  │ • Bounces   │     │ • Subscribe     │     │ • All Artists   │   │
│  │ • Complaints│     │ • Unsubscribe   │     │ • All Podcasts  │   │
│  │ • Manual    │     │ • Preferences   │     │ • All Athletes  │   │
│  └─────────────┘     └─────────────────┘     └─────────────────┘   │
│         │                    │                       │              │
│         └────────────────────┼───────────────────────┘              │
│                              ▼                                      │
│                    ┌─────────────────┐                             │
│                    │  SEND DECISION  │                             │
│                    │     ENGINE      │                             │
│                    └─────────────────┘                             │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                │
│         ▼                    ▼                    ▼                │
│   ┌──────────┐        ┌──────────┐        ┌──────────┐            │
│   │  EMAIL   │        │   SMS    │        │   PUSH   │            │
│   │ (Resend) │        │ (Future) │        │ (Future) │            │
│   └──────────┘        └──────────┘        └──────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Suppression Hierarchy

When sending a notification, check in this order:

1. **Global Suppression** → Is this email/phone globally blocked?
   - Hard bounce → Block forever
   - Spam complaint → Block forever
   - Manual suppression → Block per reason

2. **Category Suppression** → Has user opted out of this category?
   - Opted out of "All Artists" → Block all artist notifications

3. **Artist Suppression** → Has user unsubscribed from this artist?
   - Unsubscribed from specific artist → Block that artist only

4. **Notification Type** → Has user disabled this notification type?
   - Release previews disabled → Block preview notifications
   - Release day disabled → Block release day notifications

---

## 3. Phase 1: Global Suppression List

### Purpose

Maintain a system-wide list of email addresses and phone numbers that should **never** receive notifications, regardless of subscription status.

### Suppression Reasons

| Reason | Auto-Added | Manual | Reversible |
|--------|------------|--------|------------|
| `hard_bounce` | Yes (webhook) | No | No |
| `spam_complaint` | Yes (webhook) | No | No |
| `invalid_address` | Yes (validation) | No | No |
| `user_request` | No | Yes | Yes (with verification) |
| `abuse` | No | Yes (admin) | Yes (admin only) |
| `legal` | No | Yes (admin) | No |

### Key Behaviors

- **Pre-send check**: Before any notification send, check global suppression
- **Idempotent**: Adding same email twice does not error
- **Audit trail**: All additions/removals logged with reason, timestamp, source
- **Case-insensitive**: Emails normalized to lowercase before hashing
- **Hash storage**: Store SHA-256 hash of email for privacy + fast lookup

---

## 4. Phase 2: Bounce & Complaint Handling

### Resend Webhook Integration

Resend sends webhooks for email events. We need to handle:

| Event | Action |
|-------|--------|
| `email.bounced` | Add to global suppression with reason `hard_bounce` |
| `email.complained` | Add to global suppression with reason `spam_complaint` |
| `email.delivered` | Update delivery status (optional) |
| `email.opened` | Track engagement (optional) |
| `email.clicked` | Track engagement (optional) |

### Webhook Endpoint

```
POST /api/webhooks/resend
```

- Verify webhook signature using Resend's signing secret
- Parse event type and extract email address
- Add to suppression list if bounce/complaint
- Log event for debugging and compliance

### Bounce Types

| Type | Category | Action |
|------|----------|--------|
| Hard bounce (550, 551, 552, 553, 554) | Permanent | Suppress forever |
| Soft bounce (421, 450, 451, 452) | Temporary | Retry 3x then soft-suppress |
| Complaint (spam report) | Permanent | Suppress forever |

### Retry Logic for Soft Bounces

```
Attempt 1: Immediate
Attempt 2: +4 hours
Attempt 3: +24 hours
After 3 failures: Mark as soft_bounce, suppress for 30 days
```

---

## 5. Phase 3: Notification Categories & Granular Unsubscribe

### Category System

Users can subscribe/unsubscribe at multiple levels:

```
Global Level
└── All Jovie Notifications (master switch)
    │
    ├── Category Level
    │   ├── All Artist Notifications
    │   ├── All Podcaster Notifications
    │   ├── All Athlete Notifications
    │   └── Jovie Platform Updates
    │
    └── Artist Level
        ├── Artist A
        │   ├── Release Previews
        │   └── Release Day
        ├── Artist B
        │   ├── Release Previews
        │   └── Release Day
        └── ...
```

### Unsubscribe Options

When a user clicks "Unsubscribe" in an email:

1. **Landing Page** (`/notifications/manage?token=xxx`)
   - Shows current subscriptions
   - Options:
     - Unsubscribe from this artist only
     - Unsubscribe from all artists
     - Unsubscribe from all Jovie emails
   - Signed token for security (no login required)

2. **One-Click Unsubscribe** (List-Unsubscribe header)
   - RFC 8058 compliant
   - Unsubscribes from the specific artist only
   - Confirmation page with option to unsubscribe from more

### Unsubscribe Token Format

```typescript
// Payload
{
  email_hash: string;      // SHA-256 of email
  artist_id: string;       // UUID of artist (optional)
  type: 'artist' | 'category' | 'global';
  exp: number;             // Expiry timestamp (90 days)
}

// Signed with HMAC-SHA256 using UNSUBSCRIBE_SECRET
```

---

## 6. Phase 4: Multi-Channel Support

### Channel Architecture

| Channel | Provider | Status | Verification |
|---------|----------|--------|--------------|
| Email | Resend | Active | Optional (double opt-in planned) |
| SMS | TBD (Twilio/Telnyx) | Planned | Required (OTP) |
| Push | TBD (FCM/APNs) | Planned | Device token |
| In-App | Internal | Planned | Authenticated session |

### Per-Channel Suppression

Each channel has its own suppression list:

- Email: bounces, complaints, unsubscribes
- SMS: carrier blocks, STOP replies, invalid numbers
- Push: unregistered tokens, app uninstalls

### Channel Preference Model

```typescript
interface ChannelPreferences {
  email: {
    enabled: boolean;
    verified: boolean;
    frequency: 'immediate' | 'daily_digest' | 'weekly_digest';
  };
  sms: {
    enabled: boolean;
    verified: boolean;
    frequency: 'immediate' | 'important_only';
  };
  push: {
    enabled: boolean;
    frequency: 'immediate' | 'batched';
  };
  in_app: {
    enabled: boolean;
  };
}
```

---

## 7. Phase 5: Dashboard Notification Settings

### Creator Dashboard Settings

Location: `/app/settings/notifications`

**Sections:**

1. **Your Notifications** (Creator receives)
   - New subscriber alerts
   - Weekly subscriber digest
   - Release performance updates
   - Jovie platform announcements

2. **Fan Notification Settings** (What fans receive)
   - Default notification types enabled for new subscribers
   - Email templates customization (future)
   - Send timing preferences

3. **Suppression Management**
   - View suppressed emails (hashed/masked for privacy)
   - Export suppression list
   - Import suppression list (from previous ESP)
   - Manual suppression entry (admin only)

### Fan Preference Center

Location: `/notifications/preferences?token=xxx`

**Sections:**

1. **Your Subscriptions**
   - List of artists subscribed to
   - Toggle per artist
   - Unsubscribe all button

2. **Notification Preferences**
   - Release previews: On/Off
   - Release day: On/Off
   - Frequency: Immediate / Daily digest

3. **Channel Preferences**
   - Email settings
   - SMS settings (if verified)
   - Push settings (if enabled)

4. **Global Settings**
   - Unsubscribe from all Jovie emails
   - Delete my data (GDPR)

---

## 8. Database Schema

### New Tables

```sql
-- Global suppression list
CREATE TABLE email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL,  -- SHA-256 of lowercase email
  reason suppression_reason NOT NULL,
  source TEXT NOT NULL,  -- 'webhook', 'manual', 'api', 'list_import'
  source_event_id TEXT,  -- Resend event ID if from webhook
  metadata JSONB,  -- Additional context (bounce code, complaint type)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,  -- NULL = permanent, set for soft bounces
  created_by UUID REFERENCES users(id),  -- NULL for automated

  CONSTRAINT unique_email_suppression UNIQUE (email_hash, reason)
);

CREATE INDEX idx_email_suppressions_hash ON email_suppressions(email_hash);
CREATE INDEX idx_email_suppressions_expires ON email_suppressions(expires_at) WHERE expires_at IS NOT NULL;

-- Suppression reason enum
CREATE TYPE suppression_reason AS ENUM (
  'hard_bounce',
  'soft_bounce',
  'spam_complaint',
  'invalid_address',
  'user_request',
  'abuse',
  'legal'
);

-- Category subscriptions (e.g., "all artists")
CREATE TABLE category_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL,
  category_key TEXT NOT NULL,  -- 'all_artists', 'all_podcasters', 'platform_updates'
  subscribed BOOLEAN NOT NULL DEFAULT true,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_category_subscription UNIQUE (email_hash, category_key)
);

CREATE INDEX idx_category_subs_hash ON category_subscriptions(email_hash);

-- Notification delivery log (for debugging and compliance)
CREATE TABLE notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_subscription_id UUID REFERENCES notification_subscriptions(id),
  fan_release_notification_id UUID REFERENCES fan_release_notifications(id),
  channel notification_channel NOT NULL,
  recipient_hash TEXT NOT NULL,  -- SHA-256 of email/phone
  status delivery_status NOT NULL,
  provider_message_id TEXT,  -- Resend message ID
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE delivery_status AS ENUM (
  'pending',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'suppressed'
);

CREATE INDEX idx_delivery_log_recipient ON notification_delivery_log(recipient_hash);
CREATE INDEX idx_delivery_log_created ON notification_delivery_log(created_at);

-- Webhook events log (raw storage for debugging)
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,  -- 'resend', 'twilio'
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,  -- Provider's event ID
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_webhook_event UNIQUE (provider, event_id)
);

CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(created_at) WHERE NOT processed;

-- Unsubscribe tokens (for signed links)
CREATE TABLE unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of token
  email_hash TEXT NOT NULL,
  scope_type TEXT NOT NULL,  -- 'artist', 'category', 'global'
  scope_id TEXT,  -- artist_id or category_key
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_unsub_tokens_hash ON unsubscribe_tokens(token_hash);
CREATE INDEX idx_unsub_tokens_expires ON unsubscribe_tokens(expires_at);
```

### Schema Migrations to Existing Tables

```sql
-- Add to notification_subscriptions
ALTER TABLE notification_subscriptions
ADD COLUMN suppressed_at TIMESTAMPTZ,
ADD COLUMN suppression_reason suppression_reason,
ADD COLUMN last_sent_at TIMESTAMPTZ,
ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN bounce_count INTEGER NOT NULL DEFAULT 0;

-- Add to fan_release_notifications
ALTER TABLE fan_release_notifications
ADD COLUMN suppression_check_at TIMESTAMPTZ,
ADD COLUMN suppression_result TEXT;  -- 'allowed', 'global_suppressed', 'category_suppressed', 'artist_suppressed'
```

---

## 9. API Design

### Webhook Endpoints

```typescript
// POST /api/webhooks/resend
// Handles Resend email events

interface ResendWebhookPayload {
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.opened' | 'email.clicked';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    // ... other fields
  };
}
```

### Suppression Management API

```typescript
// GET /api/admin/suppressions
// List suppressions (admin only)
interface ListSuppressionsParams {
  reason?: SuppressionReason;
  since?: string;
  limit?: number;
  offset?: number;
}

// POST /api/admin/suppressions
// Add manual suppression (admin only)
interface AddSuppressionRequest {
  email: string;
  reason: 'user_request' | 'abuse' | 'legal';
  notes?: string;
}

// DELETE /api/admin/suppressions/:id
// Remove suppression (admin only, reversible reasons only)
```

### Public Unsubscribe API

```typescript
// GET /api/notifications/unsubscribe?token=xxx
// Verify token and return current subscription state

// POST /api/notifications/unsubscribe
interface UnsubscribeRequest {
  token: string;
  scope: 'artist' | 'category' | 'global';
  scope_id?: string;  // artist_id or category_key
}

// GET /api/notifications/preferences?token=xxx
// Get current preferences for token holder

// PUT /api/notifications/preferences
interface UpdatePreferencesRequest {
  token: string;
  preferences: {
    release_preview?: boolean;
    release_day?: boolean;
    frequency?: 'immediate' | 'daily' | 'weekly';
  };
}
```

---

## 10. Compliance Requirements

### CAN-SPAM (US)

| Requirement | Implementation |
|-------------|----------------|
| Clear sender identification | "From: {Artist Name} via Jovie" |
| Physical address | Footer with Jovie HQ address |
| Opt-out mechanism | Unsubscribe link in every email |
| Honor opt-outs within 10 days | Immediate processing via webhook |
| No misleading subject lines | Subject review (future) |

### GDPR (EU)

| Requirement | Implementation |
|-------------|----------------|
| Lawful basis | Consent (explicit opt-in) |
| Right to access | `/api/notifications/my-data` endpoint |
| Right to erasure | "Delete my data" in preference center |
| Right to portability | Export subscriptions as JSON |
| Data minimization | Store email hash, not plaintext where possible |
| Breach notification | Sentry alerting + incident process |

### TCPA (US - SMS)

| Requirement | Implementation |
|-------------|----------------|
| Express written consent | OTP verification + consent checkbox |
| Clear disclosure | Terms shown before subscribe |
| Easy opt-out | Reply STOP, link in messages |
| Time restrictions | No SMS 9pm-8am local time |
| Caller ID | Verified sender number |

### CASL (Canada)

| Requirement | Implementation |
|-------------|----------------|
| Express consent | Double opt-in for CA addresses |
| Consent records | `contact_consents` table with timestamp, IP, consent text |
| Unsubscribe | Same as CAN-SPAM |

---

## 11. Implementation Milestones

### Milestone 1: Foundation (Estimated Scope: ~40 story points)

**Goal:** Global suppression list + Resend webhook integration

- [ ] Create `email_suppressions` table
- [ ] Create `webhook_events` table
- [ ] Build Resend webhook handler (`/api/webhooks/resend`)
- [ ] Implement webhook signature verification
- [ ] Add suppression check to notification send flow
- [ ] Create `notification_delivery_log` table
- [ ] Add admin UI for viewing suppressions
- [ ] Write tests for bounce/complaint handling

**Success Criteria:**
- Hard bounces automatically suppressed
- Spam complaints automatically suppressed
- No emails sent to suppressed addresses
- Webhook events logged for debugging

### Milestone 2: Unsubscribe Experience (Estimated Scope: ~30 story points)

**Goal:** Self-service unsubscribe with granularity

- [ ] Create `unsubscribe_tokens` table
- [ ] Build token generation utility
- [ ] Create unsubscribe landing page (`/notifications/manage`)
- [ ] Implement one-click unsubscribe (RFC 8058)
- [ ] Add List-Unsubscribe header to all emails
- [ ] Build artist-level unsubscribe
- [ ] Build category-level unsubscribe
- [ ] Build global unsubscribe
- [ ] Write E2E tests for unsubscribe flows

**Success Criteria:**
- Users can unsubscribe from one artist
- Users can unsubscribe from all artists
- Users can unsubscribe from all Jovie emails
- One-click unsubscribe works in Gmail/Outlook

### Milestone 3: Category System (Estimated Scope: ~25 story points)

**Goal:** Category-based subscriptions and preferences

- [ ] Create `category_subscriptions` table
- [ ] Define category taxonomy (artists, podcasters, platform)
- [ ] Auto-enroll subscribers to category on artist subscribe
- [ ] Build category preference management
- [ ] Add category check to send decision engine
- [ ] Update preference center UI with categories
- [ ] Migrate existing data to new schema

**Success Criteria:**
- Users can opt out of all artist notifications
- Users can maintain per-artist preferences after category opt-out
- Analytics track category-level engagement

### Milestone 4: Preference Center (Estimated Scope: ~35 story points)

**Goal:** Full self-service notification management

- [ ] Build fan preference center page
- [ ] Implement notification type toggles (preview/release day)
- [ ] Add frequency settings (immediate/digest)
- [ ] Build GDPR data export
- [ ] Build GDPR data deletion
- [ ] Create preference center email template
- [ ] Add preference link to all emails
- [ ] Write E2E tests for preference management

**Success Criteria:**
- Users can manage all preferences without login
- GDPR export produces valid JSON
- GDPR deletion removes all user data
- Preferences honored in send flow

### Milestone 5: Creator Dashboard (Estimated Scope: ~25 story points)

**Goal:** Creator visibility and control

- [ ] Build notifications settings page for creators
- [ ] Add subscriber suppression visibility (masked)
- [ ] Build suppression list import/export
- [ ] Add notification analytics (sent/delivered/opened)
- [ ] Create creator notification preferences
- [ ] Add manual subscriber suppression (edge cases)

**Success Criteria:**
- Creators can see delivery rates
- Creators can export suppression list
- Creators can import suppression list from previous ESP

### Milestone 6: Multi-Channel (Estimated Scope: ~50 story points)

**Goal:** SMS and push notification channels

- [ ] Integrate SMS provider (Twilio/Telnyx)
- [ ] Build SMS OTP verification flow
- [ ] Create SMS suppression handling (STOP keyword)
- [ ] Add SMS carrier block handling
- [ ] Implement time-zone aware sending (TCPA)
- [ ] Build push notification infrastructure
- [ ] Create push token management
- [ ] Add channel selector in preference center

**Success Criteria:**
- SMS notifications work with OTP verification
- Push notifications work on iOS/Android
- Channel preferences honored per user
- TCPA time restrictions enforced

---

## Appendix A: Email Hash Strategy

### Why Hash Emails?

1. **Privacy**: Raw emails not stored in suppression table
2. **Performance**: Faster index lookups on fixed-length hash
3. **Security**: Breach exposes hashes, not usable emails

### Hash Implementation

```typescript
import { createHash } from 'crypto';

function hashEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex');
}

// Lookup
const isBlocked = await db.query.emailSuppressions.findFirst({
  where: eq(emailSuppressions.emailHash, hashEmail(email))
});
```

---

## Appendix B: Resend Webhook Signature Verification

```typescript
import { createHmac } from 'crypto';

function verifyResendSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  return signature === expectedSignature;
}
```

---

## Appendix C: Send Decision Flowchart

```
┌─────────────────────┐
│   Prepare to Send   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check Global        │──── Suppressed ────▶ BLOCK (log reason)
│ Suppression List    │
└──────────┬──────────┘
           │ Not Suppressed
           ▼
┌─────────────────────┐
│ Check Category      │──── Opted Out ─────▶ BLOCK (log reason)
│ Subscription        │
└──────────┬──────────┘
           │ Opted In / No Preference
           ▼
┌─────────────────────┐
│ Check Artist        │──── Unsubscribed ──▶ BLOCK (log reason)
│ Subscription        │
└──────────┬──────────┘
           │ Subscribed
           ▼
┌─────────────────────┐
│ Check Notification  │──── Disabled ──────▶ BLOCK (log reason)
│ Type Preference     │
└──────────┬──────────┘
           │ Enabled
           ▼
┌─────────────────────┐
│ Check Frequency     │──── Digest Mode ───▶ QUEUE for digest
│ Preference          │
└──────────┬──────────┘
           │ Immediate
           ▼
┌─────────────────────┐
│      SEND           │
└─────────────────────┘
```

---

## Appendix D: Dashboard Settings UI Wireframe

```
┌────────────────────────────────────────────────────────────────┐
│  Settings > Notifications                                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  YOUR NOTIFICATIONS                                             │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ New Subscriber Alerts                          [  ON  ] │   │
│  │ Get notified when someone subscribes                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Weekly Subscriber Digest                       [  ON  ] │   │
│  │ Weekly summary of subscriber activity                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Jovie Platform Updates                         [ OFF  ] │   │
│  │ New features and announcements                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                                                 │
│  FAN NOTIFICATION DEFAULTS                                      │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Release Previews (Default)                     [  ON  ] │   │
│  │ Fans receive a preview 24h before release               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Release Day Notifications (Default)            [  ON  ] │   │
│  │ Fans notified on release day                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                                                 │
│  SUPPRESSION MANAGEMENT                                         │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  Suppressed Addresses: 23                                       │
│  [View Suppression List]  [Export]  [Import]                    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Appendix E: Fan Preference Center UI Wireframe

```
┌────────────────────────────────────────────────────────────────┐
│  🔔  Manage Your Jovie Notifications                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  YOUR SUBSCRIPTIONS                                             │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🎵 Lady Gaga                                   [  ON  ] │   │
│  │    └── Release Previews                        [  ON  ] │   │
│  │    └── Release Day                             [  ON  ] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🎵 Taylor Swift                                [  ON  ] │   │
│  │    └── Release Previews                        [ OFF  ] │   │
│  │    └── Release Day                             [  ON  ] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🎵 Drake                                       [ OFF  ] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                                                 │
│  GLOBAL SETTINGS                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ All Artist Notifications                       [  ON  ] │   │
│  │ Receive updates from artists you follow                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Jovie Platform Updates                         [ OFF  ] │   │
│  │ New features and recommendations                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                                                 │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Unsubscribe from All]           [Delete My Data]              │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-17 | Claude | Initial draft |
