# Domain Architecture: Single Domain Setup

This document outlines Jovie's single-domain architecture where everything is served from `jov.ie`.

## Domain Model

| Domain | Purpose | Notes |
|--------|---------|-------|
| `jov.ie` | Everything | Marketing, auth, profiles, dashboard |
| `meetjovie.com` | Legacy redirect | 301 redirects to jov.ie |
| `clerk.jov.ie` | Clerk proxy | Custom Clerk frontend API |

## URL Routing

All routes are served from `jov.ie`:

### Public Routes
- `jov.ie/` - Homepage
- `jov.ie/blog` - Blog
- `jov.ie/pricing` - Pricing page
- `jov.ie/support` - Support page
- `jov.ie/legal/*` - Legal pages (privacy, terms)
- `jov.ie/about` - About page
- `jov.ie/features` - Features page

### Profile Routes
- `jov.ie/{username}` - Public profile page
- `jov.ie/{username}/tip` - Tip page
- `jov.ie/{username}/listen` - Listen page (DSP routing)
- `jov.ie/{username}/subscribe` - Subscription page

### App Routes (Dashboard)
- `jov.ie/app/` - Main dashboard (redirects to /app/profile)
- `jov.ie/app/profile` - Profile management
- `jov.ie/app/audience` - Audience analytics
- `jov.ie/app/earnings` - Earnings dashboard
- `jov.ie/app/settings/*` - Settings pages
- `jov.ie/app/admin/*` - Admin pages

### Auth Routes
- `jov.ie/signin` - Sign in
- `jov.ie/signup` - Sign up
- `jov.ie/waitlist` - Waitlist
- `jov.ie/onboarding/*` - Onboarding flow

### API Routes
- `jov.ie/api/*` - All API endpoints

## Environment Variables

```bash
# Domain Configuration (all point to jov.ie)
NEXT_PUBLIC_PROFILE_URL=https://jov.ie
NEXT_PUBLIC_APP_URL=https://jov.ie
NEXT_PUBLIC_PROFILE_HOSTNAME=jov.ie
NEXT_PUBLIC_APP_HOSTNAME=jov.ie
NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN=jov.ie
```

## Vercel Configuration

### Domains in Vercel Dashboard

1. `jov.ie` (primary)
2. `www.jov.ie` (redirect to `jov.ie`)
3. `meetjovie.com` (redirect to `jov.ie`)
4. `www.meetjovie.com` (redirect to `jov.ie`)

### DNS Configuration

For `jov.ie`:
```
Type    Name    Value
A       @       76.76.21.21
CNAME   www     cname.vercel-dns.com
CNAME   clerk   frontend-api.clerk.services
```

## Clerk Configuration

### Clerk Proxy

We use a custom Clerk proxy at `clerk.jov.ie` to avoid satellite domain costs:

1. DNS: `clerk.jov.ie` CNAME → `frontend-api.clerk.services`
2. Environment: `NEXT_PUBLIC_CLERK_FRONTEND_API=https://clerk.jov.ie`

### Redirect URLs

- Sign-in redirect: `/waitlist` or `/app/profile`
- Sign-up redirect: `/waitlist` or `/onboarding`
- After sign-out: `/`

## Stripe Configuration

### Webhook Endpoints

- Main webhook: `https://jov.ie/api/webhooks/stripe`
- Tip webhook: `https://jov.ie/api/webhooks/stripe/tip`

### Checkout URLs

- Success: `https://jov.ie/billing/success`
- Cancel: `https://jov.ie/billing/cancel`
- Customer portal return: `https://jov.ie/billing`

## SEO Configuration

### Robots.txt

Single robots.txt for `jov.ie`:
- Allow: `/` (marketing and profiles)
- Disallow: `/app/` (authenticated dashboard)
- Disallow: `/api/` (API endpoints)
- Disallow: `/out/` (redirect links)

### Canonical URLs

- All pages use `https://jov.ie/{path}` as canonical
- Profile pages: `https://jov.ie/{username}`

### Sitemap

Located at `jov.ie/sitemap.xml`:
- Marketing pages
- Blog posts
- Public profile pages

## Legacy Domain Handling

### meetjovie.com

All traffic to `meetjovie.com` is 301 redirected to `jov.ie`:
- `meetjovie.com/*` → `jov.ie/*`
- `www.meetjovie.com/*` → `jov.ie/*`

This redirect is handled in the middleware (`proxy.ts`).

## Development

### Local Development

- URL: `http://localhost:3100`
- Dashboard: `http://localhost:3100/app/*`
- Profiles: `http://localhost:3100/{username}`

### Preview Deployments

Vercel preview deployments work the same way:
- `*.vercel.app/app/*` - Dashboard
- `*.vercel.app/{username}` - Profiles

### Staging

- URL: `https://main.jov.ie`
- Same routing as production

## Files Reference

Key files for domain configuration:

- `constants/domains.ts` - Domain constants and helpers
- `lib/env-public.ts` - Environment variable defaults
- `proxy.ts` - Middleware with domain routing
- `app/robots.ts` - SEO robots.txt
- `app/sitemap.ts` - SEO sitemap
- `vercel.json` - Vercel configuration
