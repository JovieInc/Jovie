# Jovie Referral Program Design

> **Reference:** Beacons.ai referral model
> **Goal:** Enable users to earn passive, recurring income by referring friends to Jovie paid plans

---

## 📋 Executive Summary

The Jovie Referral Program allows existing users to share unique referral links with their network. When a referred user signs up for a **Pro ($39/mo)** or **Growth ($99/mo)** plan, the referrer earns a **25% recurring commission** for the lifetime of that subscription.

### Key Features
- **Unique referral codes** per user
- **Custom vanity URLs** (optional)
- **Real-time tracking dashboard**
- **Recurring monthly payouts** via Stripe Connect
- **Email notifications** for referral milestones
- **Fraud prevention** mechanisms

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REFERRAL FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. SHARE & INVITE                                                           │
│  ┌──────────────────┐                                                        │
│  │  Existing User   │ ──► Gets unique link: jovie.fm/r/ABC123               │
│  │  (Referrer)      │ ──► Shares via social, email, DM                      │
│  └──────────────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  2. SIGN UP ON JOVIE                                                         │
│  ┌──────────────────┐                                                        │
│  │   New User       │ ──► Clicks referral link                              │
│  │   (Referee)      │ ──► Cookie stored (30-day attribution window)         │
│  │                  │ ──► Signs up for Pro or Growth plan                   │
│  └──────────────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  3. START EARNING                                                            │
│  ┌──────────────────┐                                                        │
│  │   Commission     │ ──► 25% of subscription price                         │
│  │   Calculated     │ ──► Pro: $9.75/mo | Growth: $24.75/mo                 │
│  │                  │ ──► Paid monthly via Stripe Connect                   │
│  └──────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💰 Commission Structure

| Plan | Monthly Price | Referrer Commission (25%) | Annual Potential |
|------|---------------|---------------------------|------------------|
| Free | $0 | $0 | $0 |
| Pro | $39/mo | **$9.75/mo** | $117/year |
| Growth | $99/mo | **$24.75/mo** | $297/year |

### Commission Rules
- **Recurring:** Earned every month the referred user remains subscribed
- **Lifetime:** No cap on how long commissions are paid
- **Upgrades:** If referee upgrades (Pro → Growth), commission increases
- **Downgrades:** If referee downgrades, commission decreases
- **Cancellations:** Commission stops when subscription ends
- **Minimum payout:** $25 threshold before transfer

---

## 🗄️ Database Schema

### New Tables

```typescript
// apps/web/lib/db/schema/referrals.ts

import { pgTable, text, timestamp, integer, decimal, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './auth'

// Enums
export const referralStatusEnum = pgEnum('referral_status', [
  'pending',      // Link clicked, not yet signed up
  'signed_up',    // Signed up but on free plan
  'converted',    // Subscribed to paid plan
  'churned',      // Subscription cancelled
  'refunded'      // Payment refunded, commission clawed back
])

export const payoutStatusEnum = pgEnum('payout_status', [
  'pending',      // Accrued but not yet paid
  'processing',   // Payout initiated
  'completed',    // Successfully transferred
  'failed'        // Transfer failed
])

// Referral Codes - One per user
export const referralCodes = pgTable('referral_codes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id),

  // The unique referral code (e.g., "ABC123" or custom "johndoe")
  code: text('code').notNull().unique(),
  isCustom: boolean('is_custom').default(false),

  // Stats (denormalized for performance)
  totalClicks: integer('total_clicks').default(0),
  totalSignups: integer('total_signups').default(0),
  totalConversions: integer('total_conversions').default(0),
  totalEarnings: decimal('total_earnings', { precision: 10, scale: 2 }).default('0'),

  // Stripe Connect account for payouts
  stripeConnectAccountId: text('stripe_connect_account_id'),
  stripeConnectOnboarded: boolean('stripe_connect_onboarded').default(false),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Referral Clicks - Track all link clicks
export const referralClicks = pgTable('referral_clicks', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  referralCodeId: text('referral_code_id').notNull().references(() => referralCodes.id),

  // Tracking info
  ipHash: text('ip_hash'),           // Hashed for privacy
  userAgent: text('user_agent'),
  referrerUrl: text('referrer_url'),
  landingPage: text('landing_page'),

  // UTM parameters
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),

  createdAt: timestamp('created_at').defaultNow(),
})

// Referrals - Track referred users
export const referrals = pgTable('referrals', {
  id: text('id').primaryKey().$defaultFn(() => createId()),

  // Referrer (the person who shared the link)
  referrerId: text('referrer_id').notNull().references(() => users.id),
  referralCodeId: text('referral_code_id').notNull().references(() => referralCodes.id),

  // Referee (the person who signed up)
  refereeId: text('referee_id').references(() => users.id),
  refereeEmail: text('referee_email'),  // Stored before signup completes

  // Status tracking
  status: referralStatusEnum('status').default('pending'),

  // Attribution
  attributedClickId: text('attributed_click_id').references(() => referralClicks.id),
  attributionWindow: integer('attribution_window').default(30),  // days

  // Subscription info (populated on conversion)
  stripeSubscriptionId: text('stripe_subscription_id'),
  planTier: text('plan_tier'),  // 'pro' or 'growth'

  // Earnings tracking
  lifetimeEarnings: decimal('lifetime_earnings', { precision: 10, scale: 2 }).default('0'),
  lastCommissionAt: timestamp('last_commission_at'),

  // Timestamps
  clickedAt: timestamp('clicked_at'),
  signedUpAt: timestamp('signed_up_at'),
  convertedAt: timestamp('converted_at'),
  churnedAt: timestamp('churned_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Referral Commissions - Individual commission events
export const referralCommissions = pgTable('referral_commissions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  referralId: text('referral_id').notNull().references(() => referrals.id),
  referrerId: text('referrer_id').notNull().references(() => users.id),

  // Commission details
  stripeInvoiceId: text('stripe_invoice_id').notNull(),
  stripeChargeId: text('stripe_charge_id'),

  // Amounts
  subscriptionAmount: decimal('subscription_amount', { precision: 10, scale: 2 }).notNull(),
  commissionRate: decimal('commission_rate', { precision: 5, scale: 4 }).default('0.25'),
  commissionAmount: decimal('commission_amount', { precision: 10, scale: 2 }).notNull(),

  // Payout tracking
  payoutId: text('payout_id').references(() => referralPayouts.id),

  // Period
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),

  createdAt: timestamp('created_at').defaultNow(),
})

// Referral Payouts - Batch payouts to referrers
export const referralPayouts = pgTable('referral_payouts', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  referrerId: text('referrer_id').notNull().references(() => users.id),

  // Payout details
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  commissionCount: integer('commission_count').notNull(),

  // Stripe transfer
  stripeTransferId: text('stripe_transfer_id'),
  stripePayoutId: text('stripe_payout_id'),

  // Status
  status: payoutStatusEnum('status').default('pending'),
  failureReason: text('failure_reason'),

  // Timestamps
  initiatedAt: timestamp('initiated_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
})
```

### Schema Relationships

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     users       │────▶│ referral_codes  │────▶│ referral_clicks │
│                 │     │                 │     │                 │
│  (referrer)     │     │  code: ABC123   │     │  tracking data  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   referrals     │◀────│                 │
│                 │     │                 │
│ referrer_id     │     │                 │
│ referee_id      │     │                 │
│ status          │     │                 │
└─────────────────┘     └─────────────────┘
        │
        │
        ▼
┌─────────────────┐     ┌─────────────────┐
│  commissions    │────▶│    payouts      │
│                 │     │                 │
│ per invoice     │     │ batch transfer  │
└─────────────────┘     └─────────────────┘
```

---

## 🔌 API Endpoints

### Referral Code Management

```typescript
// GET /api/referral/code
// Get current user's referral code (creates if doesn't exist)
Response: {
  code: string
  url: string  // Full URL: https://jovie.fm/r/ABC123
  isCustom: boolean
  stats: {
    clicks: number
    signups: number
    conversions: number
    earnings: string
  }
}

// POST /api/referral/code/customize
// Set custom vanity code
Body: { code: string }
Response: { success: boolean, code: string }

// GET /api/referral/stats
// Get detailed referral statistics
Response: {
  summary: {
    totalClicks: number
    totalSignups: number
    totalConversions: number
    totalEarnings: string
    pendingEarnings: string
    conversionRate: number
  }
  referrals: Array<{
    id: string
    status: string
    plan: string
    earnings: string
    signedUpAt: string
  }>
  recentClicks: Array<{
    id: string
    timestamp: string
    source: string
  }>
}
```

### Referral Tracking

```typescript
// GET /api/referral/track/:code
// Track a referral click (called when landing page loads)
Response: { success: boolean }
// Sets cookie: jovie_ref=CODE (30 day expiry)

// POST /api/referral/attribute
// Attribute a signup to a referral (called during registration)
Body: { userId: string, referralCode?: string }
// Reads cookie if code not provided
```

### Stripe Connect (Payouts)

```typescript
// POST /api/referral/connect/onboard
// Create Stripe Connect account and return onboarding link
Response: { url: string }

// GET /api/referral/connect/status
// Check Stripe Connect account status
Response: {
  connected: boolean
  onboarded: boolean
  payoutsEnabled: boolean
}

// GET /api/referral/payouts
// Get payout history
Response: {
  payouts: Array<{
    id: string
    amount: string
    status: string
    commissionCount: number
    createdAt: string
  }>
  nextPayout: {
    amount: string
    estimatedDate: string
  }
}
```

### Webhooks

```typescript
// POST /api/stripe/webhooks
// Handle Stripe events for referral commissions

// Events to handle:
// - invoice.paid: Calculate and record commission
// - customer.subscription.updated: Update referral plan tier
// - customer.subscription.deleted: Mark referral as churned
// - transfer.paid: Update payout status
// - charge.refunded: Claw back commission
```

---

## 🎨 UI Components

### 1. Referral Dashboard Page

**Route:** `/dashboard/referrals`

```tsx
// Components needed:
<ReferralDashboard>
  <ReferralCodeCard />      // Display code, copy button, share buttons
  <ReferralStatsCards />    // Clicks, signups, conversions, earnings
  <ReferralsList />         // Table of referred users
  <PayoutSetup />           // Stripe Connect onboarding
  <PayoutHistory />         // Past payouts
  <EarningsChart />         // Monthly earnings visualization
</ReferralDashboard>
```

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  🎁 Referral Program                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  YOUR REFERRAL LINK                                          │   │
│  │                                                              │   │
│  │  jovie.fm/r/ABC123                    [Copy] [Customize]    │   │
│  │                                                              │   │
│  │  Share: [Twitter] [Facebook] [LinkedIn] [Email] [WhatsApp]  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │   CLICKS     │ │   SIGNUPS    │ │ CONVERSIONS  │ │  EARNINGS  │ │
│  │     247      │ │      34      │ │      12      │ │  $234.50   │ │
│  │   ▲ 23%      │ │   ▲ 15%      │ │   ▲ 8%       │ │  ▲ 12%     │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  EARNINGS OVER TIME                                          │   │
│  │  ████                                                        │   │
│  │  ████ ████                                                   │   │
│  │  ████ ████ ████ ████                                        │   │
│  │  Jan  Feb  Mar  Apr  May  Jun                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  REFERRED USERS                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  User          │ Status    │ Plan   │ Earnings │ Joined     │   │
│  │──────────────────────────────────────────────────────────────│   │
│  │  j***@email    │ Active ●  │ Growth │ $74.25   │ Jan 15     │   │
│  │  m***@email    │ Active ●  │ Pro    │ $29.25   │ Feb 3      │   │
│  │  s***@email    │ Churned ○ │ Pro    │ $19.50   │ Dec 10     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  PAYOUT SETUP                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  💳 Connect your Stripe account to receive payouts          │   │
│  │                                                              │   │
│  │  [Connect with Stripe]                                       │   │
│  │                                                              │   │
│  │  Pending earnings: $58.50                                    │   │
│  │  Next payout: Feb 1, 2025                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Public Referral Landing Page

**Route:** `/r/[code]`

```tsx
// Handles referral link clicks
// 1. Validates code exists
// 2. Sets attribution cookie
// 3. Redirects to signup with referral context
```

### 3. Signup Flow Integration

Add referral banner to signup page when referral cookie is present:

```
┌─────────────────────────────────────────────────────────────────────┐
│  🎉 You've been referred by a friend!                               │
│  Sign up for Pro or Growth and you both benefit.                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Share Modal Component

```tsx
<ReferralShareModal>
  // Pre-written messages for each platform
  // Twitter: "I've been using @JovieHQ to [benefit]. Sign up with my link and..."
  // Email: Subject + body template
  // Copy link with success toast
</ReferralShareModal>
```

---

## 📧 Email Notifications

### For Referrers

| Event | Email | Content |
|-------|-------|---------|
| First referral click | `referral-first-click` | "Someone clicked your link!" |
| Referral signed up | `referral-signup` | "Your friend just joined Jovie!" |
| Referral converted | `referral-converted` | "🎉 Congrats! You earned $X.XX" |
| Monthly summary | `referral-monthly-summary` | Stats + earnings + upcoming payout |
| Payout sent | `referral-payout-sent` | "$X.XX has been transferred to your account" |
| Referral churned | `referral-churned` | "Your referred user cancelled their subscription" |

### For Referees

| Event | Email | Content |
|-------|-------|---------|
| Welcome (from referral) | `welcome-referred` | "Welcome! You were referred by a friend." |

---

## 🔒 Fraud Prevention

### Rules

1. **Self-referral prevention:** Users cannot use their own referral code
2. **Duplicate prevention:** Same email/IP can only be attributed once per referrer
3. **Velocity limits:** Max 100 signups per referrer per day
4. **Payment verification:** Commission only on successful, non-refunded payments
5. **Minimum subscription:** 7-day cooling period before commission is confirmed
6. **Clawback policy:** Refunds within 30 days claw back commission

### Implementation

```typescript
// Fraud detection checks
const fraudChecks = {
  // Check 1: Self-referral
  isSelfReferral: (referrerId: string, refereeId: string) => referrerId === refereeId,

  // Check 2: IP abuse (same IP, multiple accounts)
  isIPAbuse: async (ipHash: string, referralCodeId: string) => {
    const count = await db.referrals.count({
      where: { ipHash, referralCodeId, createdAt: { gte: subDays(new Date(), 1) } }
    })
    return count > 5
  },

  // Check 3: Email domain abuse (disposable emails)
  isDisposableEmail: (email: string) => {
    const disposableDomains = ['tempmail.com', 'guerrillamail.com', ...]
    return disposableDomains.some(d => email.endsWith(d))
  },

  // Check 4: Payment method reuse
  isPaymentReuse: async (stripeCustomerId: string, referrerId: string) => {
    // Check if payment method was previously used by referrer or their referrals
  }
}
```

---

## 🔄 Stripe Integration

### Commission Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                      COMMISSION CALCULATION FLOW                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. Stripe webhook: invoice.paid                                      │
│     └──► Identify if customer has referral attribution                │
│                                                                       │
│  2. Calculate commission                                              │
│     └──► subscription_amount × 0.25 = commission_amount               │
│                                                                       │
│  3. Record commission                                                 │
│     └──► Insert into referral_commissions table                       │
│     └──► Update referral.lifetime_earnings                            │
│     └──► Update referral_code.total_earnings                          │
│                                                                       │
│  4. Check payout threshold                                            │
│     └──► If pending >= $25, queue for next payout batch               │
│                                                                       │
│  5. Monthly payout job (1st of month)                                 │
│     └──► Aggregate pending commissions per referrer                   │
│     └──► Create Stripe Transfer to Connect account                    │
│     └──► Update payout status                                         │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Stripe Connect Setup

```typescript
// Create Connect account for referrer
const createConnectAccount = async (userId: string, email: string) => {
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      transfers: { requested: true },
    },
    metadata: {
      jovie_user_id: userId,
    },
  })

  // Generate onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${BASE_URL}/dashboard/referrals?connect=refresh`,
    return_url: `${BASE_URL}/dashboard/referrals?connect=success`,
    type: 'account_onboarding',
  })

  return { accountId: account.id, onboardingUrl: accountLink.url }
}

// Execute payout transfer
const executePayout = async (referrerId: string, amount: number, commissionIds: string[]) => {
  const referralCode = await db.referralCodes.findFirst({ where: { userId: referrerId } })

  const transfer = await stripe.transfers.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'usd',
    destination: referralCode.stripeConnectAccountId,
    metadata: {
      jovie_referrer_id: referrerId,
      commission_ids: commissionIds.join(','),
    },
  })

  return transfer
}
```

---

## 📁 File Structure

```
apps/web/
├── app/
│   ├── api/
│   │   ├── referral/
│   │   │   ├── code/
│   │   │   │   ├── route.ts              # GET/POST referral code
│   │   │   │   └── customize/route.ts    # POST custom code
│   │   │   ├── track/[code]/route.ts     # GET track click
│   │   │   ├── attribute/route.ts        # POST attribute signup
│   │   │   ├── stats/route.ts            # GET referral stats
│   │   │   ├── connect/
│   │   │   │   ├── onboard/route.ts      # POST create connect account
│   │   │   │   └── status/route.ts       # GET connect status
│   │   │   └── payouts/route.ts          # GET payout history
│   │   └── stripe/
│   │       └── webhooks/
│   │           └── route.ts              # Add referral commission handling
│   ├── (app)/
│   │   └── dashboard/
│   │       └── referrals/
│   │           └── page.tsx              # Referral dashboard
│   └── r/
│       └── [code]/
│           └── page.tsx                  # Public referral landing
├── components/
│   └── referrals/
│       ├── referral-code-card.tsx
│       ├── referral-stats-cards.tsx
│       ├── referrals-list.tsx
│       ├── payout-setup.tsx
│       ├── payout-history.tsx
│       ├── earnings-chart.tsx
│       ├── share-modal.tsx
│       └── referral-banner.tsx           # For signup page
├── lib/
│   ├── db/
│   │   └── schema/
│   │       └── referrals.ts              # New schema file
│   ├── referrals/
│   │   ├── generate-code.ts              # Code generation logic
│   │   ├── track-click.ts                # Click tracking
│   │   ├── attribute-referral.ts         # Attribution logic
│   │   ├── calculate-commission.ts       # Commission calculation
│   │   └── fraud-detection.ts            # Fraud prevention
│   └── stripe/
│       └── connect.ts                    # Stripe Connect helpers
└── jobs/
    └── referral-payouts.ts               # Monthly payout job
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema and migrations
- [ ] Referral code generation
- [ ] Basic API endpoints (code, track, attribute)
- [ ] Referral landing page `/r/[code]`
- [ ] Attribution cookie logic

### Phase 2: Dashboard (Week 2-3)
- [ ] Referral dashboard page
- [ ] Stats cards and referrals list
- [ ] Share modal with social links
- [ ] Custom code functionality

### Phase 3: Commissions (Week 3-4)
- [ ] Stripe webhook integration for invoice.paid
- [ ] Commission calculation and recording
- [ ] Stripe Connect account creation
- [ ] Connect onboarding flow

### Phase 4: Payouts (Week 4-5)
- [ ] Payout aggregation logic
- [ ] Monthly payout cron job
- [ ] Payout history UI
- [ ] Payout email notifications

### Phase 5: Polish (Week 5-6)
- [ ] Email notifications (all events)
- [ ] Fraud detection implementation
- [ ] Analytics and reporting
- [ ] Edge cases and error handling
- [ ] Testing and QA

---

## 📊 Success Metrics

| Metric | Target |
|--------|--------|
| Referral program adoption | 30% of active users have shared their link |
| Click-to-signup rate | 15% |
| Signup-to-conversion rate | 25% |
| Referral-attributed revenue | 20% of new subscriptions |
| Average earnings per referrer | $50/month |
| Referrer retention | 90% (referrers less likely to churn) |

---

## ❓ Open Questions

1. **Commission rate:** Should 25% be the fixed rate, or offer tiers (more referrals = higher rate)?
2. **Credit vs. Cash:** Should earnings be cash payouts or Jovie credits (toward own subscription)?
3. **Cap:** Should there be a maximum earning cap per referrer?
4. **Free tier referrals:** Should referring free users give any benefit?
5. **Two-sided incentive:** Should the referee also get a discount (e.g., first month 20% off)?
6. **Payout frequency:** Monthly vs. weekly vs. on-demand?

---

## 🔗 References

- [Beacons Referral Program](https://beacons.ai/referral)
- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Transfer API](https://stripe.com/docs/api/transfers)
