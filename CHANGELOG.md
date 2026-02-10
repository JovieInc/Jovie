# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

## [Unreleased]

### Added

- Initial design token map and tailwind v4 config
- Canonical shadcn Button atom
- Button atom now supports loading state and token-driven accent styles

- **Pro Subscription System**: Implemented $5/month Pro plan with Stripe Checkout integration
  - Created `/pricing` page with custom pricing UI showing Free and Pro plans
  - Added Stripe Checkout API route (`/api/stripe/redirect`) with user authentication
  - Implemented Stripe webhook handler (`/api/stripe/webhook`) for subscription management
  - Added billing success page (`/billing/success`) with user-friendly confirmation
  - Created `BrandingBadge` component that automatically hides "Made with Jovie" text for Pro users
  - Updated `ProfileFooter` component to use the new branding system
  - Added middleware protection for billing routes
  - Updated environment variables to include Stripe configuration
  - Added comprehensive README section with billing setup instructions

### Changed

- **Branding Logic**: Updated from artist-specific settings to user plan-based control
  - Branding now controlled by Clerk user metadata (`publicMetadata.plan`)
  - Supports "free" (shows branding) and "pro" (hides branding) plans
  - Removed hardcoded "Powered by Jovie" text from artist profile routes
  - Updated `lib/footer.ts` to accept user plan parameter

### Technical Details

- Added Stripe SDK dependency for payment processing
- Implemented Clerk user metadata updates via webhook
- Created unit tests for `BrandingBadge` component
- Added E2E tests for pricing page functionality
- All changes follow existing TypeScript and ESLint standards
- Maintains backward compatibility with existing artist profiles

- Hardened Drizzle migration flow on `main` by fixing index migrations to avoid `CREATE INDEX CONCURRENTLY` inside the transactional migrator, pinned `parse5` via `pnpm.overrides` to stabilize Vitest jsdom tests, and aligned `CTAButton` `data-state` semantics with loading/disabled states so the component and unit tests stay in sync.

### Security

- Stripe webhook signature verification for secure payment processing
- User authentication required for all billing operations
- Environment variable validation for payment security
