# Domain Consolidation Plan: Everything to jov.ie

> **Status:** Planning
> **Target:** Consolidate all web traffic to `jov.ie`, use subdomains for email

## Executive Summary

Migrate from two-domain architecture (jov.ie + meetjovie.com) to single-domain (jov.ie) for SEO benefits while maintaining email deliverability through dedicated subdomains.

## Final Architecture

```
jov.ie (PRIMARY DOMAIN - ALL WEB TRAFFIC)
├── /                        → Homepage/marketing
├── /blog/*                  → Blog content
├── /pricing                 → Pricing page
├── /legal/*                 → Privacy, Terms
├── /app/*                   → Dashboard (authenticated)
├── /signin, /signup         → Auth pages
├── /onboarding              → User onboarding
├── /waitlist                → Waitlist
├── /{username}              → Creator profiles
├── /{username}/tip          → Tip page
├── /{username}/listen       → Music links
├── /{username}/subscribe    → Notifications signup
└── /api/*                   → API routes

clerk.jov.ie (CLERK AUTH PROXY)
└── Clerk frontend API proxy (CNAME → frontend-api.clerk.dev)

mail.jov.ie (TRANSACTIONAL EMAIL)
├── notifications@mail.jov.ie    → System notifications
├── support@mail.jov.ie          → Support replies
└── noreply@mail.jov.ie          → No-reply transactional

mail.meetjovie.com (MARKETING EMAIL - isolated reputation)
├── invites@mail.meetjovie.com   → GTM/ingest funnel invites
├── hello@mail.meetjovie.com     → Marketing campaigns
└── updates@mail.meetjovie.com   → Product updates

meetjovie.com (REDIRECT ONLY)
└── /* → 301 redirect to jov.ie/*
```

## Why This Architecture

| Decision | Rationale |
|----------|-----------|
| **Single domain (jov.ie)** | Concentrates SEO authority, simpler UX, shorter URLs |
| **Transactional from jov.ie subdomain** | Users expect emails from the domain they signed up on |
| **Marketing from meetjovie.com subdomain** | Isolates marketing reputation; if spam complaints occur, main domain unaffected |
| **meetjovie.com over jovie.app** | Established domain with history = better deliverability than fresh .app domain |
| **Subdomains for email** | Isolates email reputation from web domain; industry best practice |

---

## Phase 1: DNS & External Services Setup

### 1.1 DNS Records for jov.ie

Add/update these records:

```dns
# Clerk auth proxy
clerk.jov.ie.     CNAME   frontend-api.clerk.dev.

# Transactional email (Resend)
mail.jov.ie.      MX      10 feedback-smtp.us-east-1.amazonses.com.
mail.jov.ie.      TXT     "v=spf1 include:amazonses.com ~all"

# DKIM for mail.jov.ie (get from Resend dashboard after adding domain)
resend._domainkey.mail.jov.ie.    TXT    "k=rsa; p=..."

# DMARC
_dmarc.mail.jov.ie.    TXT    "v=DMARC1; p=none; rua=mailto:dmarc@jov.ie"
```

### 1.2 DNS Records for meetjovie.com

Add/update for marketing email:

```dns
# Marketing email subdomain (Resend)
mail.meetjovie.com.     MX      10 feedback-smtp.us-east-1.amazonses.com.
mail.meetjovie.com.     TXT     "v=spf1 include:amazonses.com ~all"

# DKIM for mail.meetjovie.com
resend._domainkey.mail.meetjovie.com.    TXT    "k=rsa; p=..."

# DMARC
_dmarc.mail.meetjovie.com.    TXT    "v=DMARC1; p=none; rua=mailto:dmarc@meetjovie.com"

# Redirect all web traffic (if using DNS-level redirect)
# OR configure in Vercel (preferred)
```

### 1.3 Clerk Dashboard Configuration

**In Clerk Dashboard → Settings:**

1. **Domains:**
   - Remove: `meetjovie.com`, `app.meetjovie.com`
   - Add: `jov.ie`, `www.jov.ie`

2. **Proxy URL:**
   - Change to: `https://clerk.jov.ie`

3. **Allowed Origins:**
   - `https://jov.ie`
   - `https://www.jov.ie`
   - `http://localhost:3000` (dev)

4. **Redirects:**
   - Sign-in redirect: `https://jov.ie/app/dashboard`
   - Sign-up redirect: `https://jov.ie/onboarding`
   - After sign-out: `https://jov.ie`

### 1.4 Stripe Dashboard Configuration

**In Stripe Dashboard → Developers → Webhooks:**

Update webhook endpoints:
- `https://jov.ie/api/webhooks/stripe`
- `https://jov.ie/api/webhooks/stripe/tip`

**In Stripe Dashboard → Settings → Branding:**
- Update domain references if any

**Checkout Session URLs (in code):**
- Success: `https://jov.ie/billing/success`
- Cancel: `https://jov.ie/billing/cancel`
- Portal return: `https://jov.ie/billing`

### 1.5 Resend Configuration

**Add domains in Resend Dashboard:**

1. **mail.jov.ie** (transactional)
   - Verify DNS records
   - Set as default sending domain

2. **mail.meetjovie.com** (marketing)
   - Verify DNS records
   - Use for GTM/ingest campaigns only

### 1.6 Google Search Console

1. Add property: `https://jov.ie`
2. Submit new sitemap: `https://jov.ie/sitemap.xml`
3. Set international targeting (if needed)
4. Keep `meetjovie.com` property to monitor redirect traffic

### 1.7 PostHog / Analytics

Update allowed domains if configured.

---

## Phase 2: Code Changes

### 2.1 Domain Constants (CRITICAL)

**File: `apps/web/constants/domains.ts`**

```typescript
// BEFORE: Two separate domains
export const PROFILE_HOSTNAME = 'jov.ie';
export const MARKETING_HOSTNAME = 'meetjovie.com';
export const APP_HOSTNAME = 'meetjovie.com';

// AFTER: Single domain
export const PRIMARY_HOSTNAME = 'jov.ie';
export const PROFILE_HOSTNAME = PRIMARY_HOSTNAME;
export const MARKETING_HOSTNAME = PRIMARY_HOSTNAME;
export const APP_HOSTNAME = PRIMARY_HOSTNAME;

// Email domains (subdomains)
export const TRANSACTIONAL_EMAIL_DOMAIN = 'mail.jov.ie';
export const MARKETING_EMAIL_DOMAIN = 'mail.meetjovie.com';

// Clerk proxy on primary domain
export const CLERK_PROXY_HOSTNAME = `clerk.${PRIMARY_HOSTNAME}`;
```

### 2.2 Environment Variables

**File: `.env.example` and production env:**

```bash
# Domain (single domain now)
NEXT_PUBLIC_APP_URL=https://jov.ie
NEXT_PUBLIC_PROFILE_URL=https://jov.ie
NEXT_PUBLIC_MARKETING_URL=https://jov.ie
NEXT_PUBLIC_APP_HOSTNAME=jov.ie
NEXT_PUBLIC_PROFILE_HOSTNAME=jov.ie
NEXT_PUBLIC_MARKETING_HOSTNAME=jov.ie

# Clerk
NEXT_PUBLIC_CLERK_FRONTEND_API=https://clerk.jov.ie

# Email
RESEND_FROM_EMAIL=notifications@mail.jov.ie
RESEND_REPLY_TO_EMAIL=support@mail.jov.ie
MARKETING_EMAIL_FROM=hello@mail.meetjovie.com
```

### 2.3 Files Requiring Changes

#### Critical Path (breaks functionality if not updated):

| File | Change |
|------|--------|
| `apps/web/constants/domains.ts` | Consolidate to single domain, add email subdomains |
| `apps/web/constants/app.ts` | Update APP_URL references |
| `apps/web/lib/env-public.ts` | Update defaults to jov.ie |
| `apps/web/vercel.json` | Update Clerk proxy rewrite |
| `apps/web/proxy.ts` | Remove multi-domain routing logic |
| `apps/web/app/robots.ts` | Consolidate to single robots.txt |
| `apps/web/app/sitemap.ts` | Consolidate to single sitemap |
| `apps/web/app/layout.tsx` | Update metadata, DNS prefetch |
| `apps/web/lib/notifications/config.ts` | Update email from addresses |

#### Secondary (functionality works but has wrong references):

| File | Change |
|------|--------|
| `apps/web/lib/security/content-security-policy.ts` | Update CSP domains |
| `apps/web/lib/sentry/config.ts` | Update privacy email |
| `apps/web/sentry.server.config.ts` | Update privacy email |
| `apps/web/sentry.edge.config.ts` | Update privacy email |
| `apps/web/instrumentation-client.ts` | Update privacy email |
| `apps/web/lib/ingestion/strategies/base/constants.ts` | Update User-Agent |
| `apps/web/lib/ingestion/strategies/linktree.ts` | Update User-Agent |
| `apps/web/lib/ingestion/strategies/beacons.ts` | Update User-Agent |
| `apps/web/lib/ingestion/magic-profile-avatar.ts` | Update User-Agent |
| `apps/web/lib/utils/platform-detection/environment.ts` | Update hostname lists |

#### Content & Documentation:

| File | Change |
|------|--------|
| `apps/web/content/legal/privacy.md` | Update email addresses |
| `apps/web/content/legal/terms.md` | Update email addresses |
| `apps/web/content/blog/*.md` | Update author profile URLs |
| `docs/DOMAIN_MIGRATION.md` | Update or deprecate |

#### Tests & Stories (non-critical):

| File | Change |
|------|--------|
| `apps/web/.lighthouserc.json` | URLs already use jov.ie |
| `apps/web/tests/unit/*.test.ts` | Update test URLs if hardcoded |
| `apps/web/components/**/*.stories.tsx` | Update example URLs |

### 2.4 Middleware Simplification

**File: `apps/web/proxy.ts`**

Remove entire multi-domain routing section (~60 lines). The middleware becomes much simpler:

```typescript
// REMOVE: isProfileHost(), isMarketingHost() functions
// REMOVE: Domain-based redirect logic (lines ~173-234)
// REMOVE: Reserved pages list (no longer needed)

// KEEP: Auth gating logic
// KEEP: Bot protection
// KEEP: CSP injection
// KEEP: Cookie handling
```

### 2.5 SEO Files Simplification

**File: `apps/web/app/robots.ts`**

```typescript
// BEFORE: Domain-specific robots
// AFTER: Single robots.txt for jov.ie

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/app/', '/admin/', '/_next/', '/private/', '/out/'],
      },
    ],
    sitemap: 'https://jov.ie/sitemap.xml',
    host: 'https://jov.ie',
  };
}
```

**File: `apps/web/app/sitemap.ts`**

```typescript
// BEFORE: Domain-specific sitemaps
// AFTER: Single sitemap with all pages

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const BASE_URL = 'https://jov.ie';

  // Marketing pages
  const marketingPages = [
    { url: BASE_URL, priority: 1 },
    { url: `${BASE_URL}/blog`, priority: 0.7 },
    { url: `${BASE_URL}/pricing`, priority: 0.6 },
    { url: `${BASE_URL}/legal/privacy`, priority: 0.3 },
    { url: `${BASE_URL}/legal/terms`, priority: 0.3 },
  ];

  // Blog posts
  const blogPages = await getBlogSlugs().then(slugs =>
    slugs.map(slug => ({ url: `${BASE_URL}/blog/${slug}`, priority: 0.6 }))
  );

  // Creator profiles
  const profilePages = await getPublicProfiles().then(profiles =>
    profiles.map(p => ({ url: `${BASE_URL}/${p.username}`, priority: 0.8 }))
  );

  return [...marketingPages, ...blogPages, ...profilePages];
}
```

### 2.6 Email Configuration

**File: `apps/web/lib/notifications/config.ts`**

```typescript
// Transactional emails (system notifications, confirmations)
export const TRANSACTIONAL_EMAIL_FROM =
  env.RESEND_FROM_EMAIL || 'Jovie <notifications@mail.jov.ie>';

export const SUPPORT_EMAIL = 'support@mail.jov.ie';

// Marketing emails (invites, campaigns) - separate domain for reputation isolation
export const MARKETING_EMAIL_FROM =
  env.MARKETING_EMAIL_FROM || 'Jovie <hello@mail.meetjovie.com>';

export const INVITE_EMAIL_FROM =
  env.INVITE_EMAIL_FROM || 'Jovie <invites@mail.meetjovie.com>';
```

**File: `apps/web/constants/domains.ts`**

```typescript
// User-facing email addresses (displayed in UI, legal docs)
export const SUPPORT_EMAIL = 'support@mail.jov.ie';
export const LEGAL_EMAIL = 'legal@mail.jov.ie';
export const PRIVACY_EMAIL = 'privacy@mail.jov.ie';
```

---

## Phase 3: Vercel Configuration

### 3.1 Update vercel.json

```json
{
  "rewrites": [
    {
      "source": "/clerk/(.*)",
      "destination": "https://clerk.jov.ie/$1"
    },
    {
      "source": "/ingest/static/(.*)",
      "destination": "https://us-assets.i.posthog.com/static/$1"
    },
    {
      "source": "/ingest/(.*)",
      "destination": "https://us.i.posthog.com/$1"
    }
  ]
}
```

### 3.2 Vercel Domain Configuration

**In Vercel Dashboard → Project → Settings → Domains:**

1. **Primary domain:** `jov.ie`
2. **Redirect:** `www.jov.ie` → `jov.ie` (301)
3. **Redirect:** `meetjovie.com` → `jov.ie` (301)
4. **Redirect:** `www.meetjovie.com` → `jov.ie` (301)

### 3.3 Vercel Redirects (vercel.json alternative)

If more control needed, add to `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "meetjovie.com" }],
      "destination": "https://jov.ie/$1",
      "permanent": true
    },
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "www.meetjovie.com" }],
      "destination": "https://jov.ie/$1",
      "permanent": true
    }
  ]
}
```

---

## Phase 4: Implementation Order

### Step 1: Preparation (No deployment)
- [ ] Add DNS records for `clerk.jov.ie`
- [ ] Add DNS records for `mail.jov.ie`
- [ ] Add DNS records for `mail.meetjovie.com` (if not exists)
- [ ] Configure domains in Resend
- [ ] Wait for DNS propagation (up to 48h, usually <1h)

### Step 2: External Services (No deployment)
- [ ] Update Clerk Dashboard settings
- [ ] Update Stripe webhook URLs
- [ ] Add `jov.ie` to Google Search Console
- [ ] Verify email sending works from new domains

### Step 3: Code Changes (Single PR)
- [ ] Update `constants/domains.ts`
- [ ] Update `lib/env-public.ts`
- [ ] Simplify `proxy.ts` (remove multi-domain routing)
- [ ] Update `vercel.json`
- [ ] Consolidate `robots.ts`
- [ ] Consolidate `sitemap.ts`
- [ ] Update `app/layout.tsx`
- [ ] Update email configuration
- [ ] Update CSP configuration
- [ ] Update Sentry configs
- [ ] Update legal content
- [ ] Run full test suite

### Step 4: Deploy & Verify
- [ ] Deploy to preview, test all flows
- [ ] Deploy to production
- [ ] Configure Vercel redirects for meetjovie.com
- [ ] Verify 301 redirects working
- [ ] Verify Clerk auth working
- [ ] Verify email sending working
- [ ] Submit sitemap to Google Search Console

### Step 5: Monitoring (Week 1)
- [ ] Monitor error rates in Sentry
- [ ] Monitor email deliverability in Resend
- [ ] Monitor 404s in analytics
- [ ] Monitor Google Search Console for crawl errors
- [ ] Check Google index status

---

## Rollback Plan

If critical issues occur:

### Quick Rollback (< 5 min)
1. Revert Vercel deployment to previous version
2. Change Vercel domain redirects back

### Full Rollback (< 30 min)
1. Revert code changes via git
2. Update Clerk Dashboard back to meetjovie.com
3. Update Stripe webhooks back
4. Deploy reverted code

### Data preserved
- All database data unchanged
- User sessions may need re-auth after Clerk changes
- Email history unchanged

---

## Testing Checklist

### Auth Flows
- [ ] Sign up (email)
- [ ] Sign up (Google OAuth)
- [ ] Sign in (email)
- [ ] Sign in (Google OAuth)
- [ ] Sign out
- [ ] Password reset

### Core Features
- [ ] View profile (public)
- [ ] Edit profile (authenticated)
- [ ] Add social links
- [ ] Tip flow
- [ ] Subscribe to notifications

### Email
- [ ] Transactional: Notification subscription confirmation
- [ ] Transactional: Password reset
- [ ] Marketing: Test invite email (if applicable)

### SEO
- [ ] robots.txt accessible
- [ ] sitemap.xml accessible
- [ ] Canonical URLs correct
- [ ] OG tags correct
- [ ] Structured data valid

### Redirects
- [ ] meetjovie.com → jov.ie (301)
- [ ] meetjovie.com/app/dashboard → jov.ie/app/dashboard (301)
- [ ] meetjovie.com/username → jov.ie/username (301)
- [ ] www variants redirect correctly

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| DNS Setup | 1-48 hours | DNS propagation |
| External Services | 1-2 hours | DNS complete |
| Code Changes | 2-4 hours | - |
| Testing | 2-3 hours | Code complete |
| Monitoring | 1 week | Deploy complete |

**Total: 1-2 days active work + monitoring**

---

## Questions to Resolve

1. **OAuth providers:** Any social login providers (Google, etc.) need callback URL updates?
2. **Existing email subscribers:** Should existing notification subscriptions receive email about domain change?
3. **QR codes in wild:** Any printed QR codes pointing to meetjovie.com? (301 redirect handles this)
4. **Backlinks:** Any major backlinks to meetjovie.com that should be manually updated?
