# Domain Migration: Multi-Domain Setup

This document outlines the domain migration from a single-domain setup (`jov.ie`) to a multi-domain architecture.

## Domain Model

| Domain | Purpose | Auth | Cookies |
|--------|---------|------|---------|
| `jov.ie` | Public creator profiles | None | Viewer subscription cookies |
| `meetjovie.com` | Marketing/company site | None | None |
| `app.meetjovie.com` | Dashboard/app | Clerk | Session cookies |

## URL Routing

### Profile Domain (`jov.ie`)
- `jov.ie/{username}` - Public profile page
- `jov.ie/{username}/tip` - Tip page
- `jov.ie/{username}/listen` - Listen page (DSP routing)
- `jov.ie/{username}/subscribe` - Subscription page
- `jov.ie/api/*` - API endpoints (for viewer subscriptions)

### Marketing Domain (`meetjovie.com`)
- `meetjovie.com/` - Homepage
- `meetjovie.com/blog` - Blog
- `meetjovie.com/pricing` - Pricing page
- `meetjovie.com/support` - Support page
- `meetjovie.com/legal/*` - Legal pages (privacy, terms)
- `meetjovie.com/about` - About page
- `meetjovie.com/features` - Features page

### App Domain (`app.meetjovie.com`)
- `app.meetjovie.com/` - Redirects to dashboard
- `app.meetjovie.com/app/dashboard` - Main dashboard
- `app.meetjovie.com/app/settings/*` - Settings pages
- `app.meetjovie.com/signin` - Sign in
- `app.meetjovie.com/signup` - Sign up
- `app.meetjovie.com/waitlist` - Waitlist
- `app.meetjovie.com/onboarding/*` - Onboarding flow
- `app.meetjovie.com/claim/*` - Profile claim flow
- `app.meetjovie.com/billing/*` - Billing pages

## Environment Variables

Add these to your Vercel/Doppler configuration:

```bash
# Domain Configuration
NEXT_PUBLIC_PROFILE_URL=https://jov.ie
NEXT_PUBLIC_MARKETING_URL=https://meetjovie.com
NEXT_PUBLIC_APP_URL=https://app.meetjovie.com
NEXT_PUBLIC_PROFILE_HOSTNAME=jov.ie
NEXT_PUBLIC_MARKETING_HOSTNAME=meetjovie.com
NEXT_PUBLIC_APP_HOSTNAME=app.meetjovie.com
NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN=meetjovie.com
```

## Vercel Configuration

### 1. Add Domains in Vercel Dashboard

1. Go to your project settings → Domains
2. Add the following domains:
   - `jov.ie` (primary for profiles)
   - `www.jov.ie` (redirect to `jov.ie`)
   - `meetjovie.com` (primary for marketing)
   - `www.meetjovie.com` (redirect to `meetjovie.com`)
   - `app.meetjovie.com` (primary for app)

### 2. DNS Configuration

For `meetjovie.com` (at your DNS provider):

```
Type    Name    Value
A       @       76.76.21.21
CNAME   www     cname.vercel-dns.com
CNAME   app     cname.vercel-dns.com
```

For `jov.ie` (at your DNS provider):

```
Type    Name    Value
A       @       76.76.21.21
CNAME   www     cname.vercel-dns.com
```

## Clerk Configuration

### 1. Update Allowed Origins

In Clerk Dashboard → Settings → Paths:

- Add `https://app.meetjovie.com` to allowed origins
- Add `https://meetjovie.com` to allowed origins (for redirects)

### 2. Update Redirect URLs

- Sign-in redirect: `https://app.meetjovie.com/waitlist`
- Sign-up redirect: `https://app.meetjovie.com/waitlist`
- After sign-out: `https://meetjovie.com`

### 3. Clerk Proxy (Optional)

If using a custom Clerk proxy domain:

1. Add CNAME record: `clerk.meetjovie.com` → `frontend-api.clerk.dev`
2. Update `NEXT_PUBLIC_CLERK_FRONTEND_API=https://clerk.meetjovie.com`

## Stripe Configuration

### 1. Update Webhook Endpoints

In Stripe Dashboard → Developers → Webhooks:

- Update webhook URL to: `https://app.meetjovie.com/api/webhooks/stripe`
- Update tip webhook URL to: `https://app.meetjovie.com/api/webhooks/stripe/tip`

### 2. Update Success/Cancel URLs

In your checkout session creation code, ensure URLs point to:

- Success: `https://app.meetjovie.com/billing/success`
- Cancel: `https://app.meetjovie.com/billing/cancel`

### 3. Customer Portal Return URL

- Return URL: `https://app.meetjovie.com/billing`

## SEO Considerations

### Canonical URLs

- Profile pages: Canonical is `https://jov.ie/{username}`
- Marketing pages: Canonical is `https://meetjovie.com/{path}`
- App pages: No indexing (noindex, nofollow)

### Sitemap

The sitemap at `meetjovie.com/sitemap.xml` includes:
- Marketing pages on `meetjovie.com`
- Blog pages on `meetjovie.com`
- Profile pages on `jov.ie`

### Redirects for Legacy Domains

If you own `jovie.app` or `jovie.ai`, set up 301 redirects:

```
jovie.app/* → meetjovie.com/*
jovie.ai/* → meetjovie.com/*
```

## Viewer Subscription Cookies

Viewer subscription cookies are scoped to `jov.ie` and will NOT carry over to `meetjovie.com`. This is intentional:

- Viewer subscriptions are managed on profile pages (`jov.ie`)
- The subscribe/manage endpoints remain on `jov.ie/api/*`
- Cookies set on `jov.ie` are accessible on all `jov.ie` profile pages

## Email Configuration

Update email sending domains:

- `support@meetjovie.com` - Support emails
- `legal@meetjovie.com` - Legal emails
- `privacy@meetjovie.com` - Privacy emails
- `notifications@meetjovie.com` - Notification emails

Ensure SPF, DKIM, and DMARC records are configured for `meetjovie.com`.

## Verification Checklist

After deployment, verify:

- [ ] `jov.ie/{username}` loads profile correctly
- [ ] `jov.ie/{username}/tip` loads tip page
- [ ] `jov.ie/{username}/subscribe` works (viewer subscription)
- [ ] `meetjovie.com` loads marketing homepage
- [ ] `meetjovie.com/blog` loads blog
- [ ] `meetjovie.com/pricing` loads pricing
- [ ] `meetjovie.com/support` loads support page
- [ ] `meetjovie.com/legal/privacy` loads privacy policy
- [ ] `meetjovie.com/legal/terms` loads terms of service
- [ ] `app.meetjovie.com` redirects to dashboard (or signin if not authenticated)
- [ ] `app.meetjovie.com/signin` shows sign-in page
- [ ] `app.meetjovie.com/signup` shows sign-up page
- [ ] Sign-in flow works and redirects correctly
- [ ] Sign-up flow works and redirects correctly
- [ ] Dashboard loads after authentication
- [ ] Stripe checkout works
- [ ] Stripe webhooks are received
- [ ] Email notifications are sent from correct domain

## Rollback Plan

If issues arise:

1. Revert environment variables to use `jov.ie` for all domains
2. Remove domain routing logic from `proxy.ts`
3. Update Clerk/Stripe settings back to `jov.ie`

## Files Changed

Key files modified in this migration:

- `constants/domains.ts` - New centralized domain configuration
- `constants/app.ts` - Updated to use domain config
- `lib/env-public.ts` - Added new domain env vars
- `proxy.ts` - Added hostname-based routing
- `app/sitemap.ts` - Multi-domain sitemap
- `app/robots.ts` - Updated for marketing domain
- Various components - Updated hardcoded `jov.ie` references
