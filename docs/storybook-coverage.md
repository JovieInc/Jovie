# Storybook Coverage Report

## Summary

- **Total Story Files**: 116
- **Total Component Files**: ~250
- **Coverage**: ~46% (focused on reusable UI components)
- **Storybook Version**: 9.1.16
- **Framework**: `@storybook/nextjs-vite`

## How to Run Storybook

```bash
# Development mode
pnpm storybook

# Build static version
pnpm storybook:build
```

Storybook runs on `http://localhost:6006` by default.

## Directories Scanned

- `components/atoms/` - Design system primitives
- `components/molecules/` - Common compositions
- `components/organisms/` - Complex widgets
- `components/ui/` - UI utilities
- `components/auth/` - Authentication components
- `components/dashboard/` - Dashboard components
- `components/profile/` - Profile page components
- `components/feedback/` - Error/empty states
- `components/pricing/` - Pricing page components
- `components/home/` - Homepage components
- `components/site/` - Site-wide components
- `components/waitlist/` - Waitlist components
- `components/tipping/` - Tipping components

## Components with Stories

### Atoms (40 stories)
- AmountSelector, ArtistAvatar, ArtistName, Avatar, BackgroundPattern
- Button, Copyright, DSPButton, Divider, DropdownMenu
- GradientText, HeaderText, Icon, IconBadge, Input
- JovieIcon, JovieLogo, Label, Logo, LogoIcon, LogoLink, LogoLoader
- OptimizedImage, PlaceholderImage, Popover, ProfileNavButton
- ProgressIndicator, QRCode, SectionHeading, Select, Separator
- Sheet, SidebarCollapseButton, Skeleton, SocialIcon, StatusBadge
- Textarea, Toast, Tooltip, VerifiedBadge, WrappedSocialLink

### Molecules (18 stories)
- ArtistCard, ArtistInfo, Card, DataCard, DSPButtonGroup
- FeatureCard, FormField, FormStatus, FrostedContainer, InfoBox
- LoadingButton, LoadingSkeleton, PrimaryCTA, QRCodeCard
- Section, SkeletonCard, SocialLink, StepCard, TipSelector

### Organisms (20 stories)
- AnimatedAccordion, AvatarUploadable, BenefitsSection, BrandingBadge
- CTASection, CookieModal, Dialog, EmptyState, FeaturedArtistsSection
- Footer, HeaderNav, HeroSection, HowItWorksSection, ListenSection
- ProfileSection, ProfileShell, Sidebar, TipSection

### UI Components (7 stories)
- Badge, CTAButton, FooterLink, FrostedButton, LoadingSpinner, NavLink

### Auth Components (4 stories)
- AuthBranding, AuthFormContainer, AuthLayout, AuthPageSkeleton

### Dashboard Components (10 stories)
- AnalyticsCards, ArtistSelectionForm, CompletionBanner
- CopyToClipboardButton, DashboardCard, ListenNowForm
- OnboardingFormWrapper, ProfileForm, SectionHeader
- SettingsForm, SetupTaskItem, SocialsForm, UniversalLinkInput

### Profile Components (4 stories)
- AnimatedArtistPage, ClaimBanner, ProfileSkeleton

### Feedback Components (3 stories)
- ErrorBanner, ErrorDialog, StarterEmptyState

### Pricing Components (3 stories)
- FeatureList, PricingCTA, PricingToggle

### Home Components (2 stories)
- HomeHero, HeroHandlePreviewChip

### Site Components (2 stories)
- Container, Footer

### Waitlist Components (1 story)
- WaitlistSkeleton

### Tipping Components (1 story)
- EmptyStates

## Components Intentionally Excluded

The following components are **not suitable for Storybook** due to their nature:

### Server Components / Data Fetching
- `components/admin/*` - Admin-only, requires server data
- `components/dashboard/DashboardAnalytics.tsx` - Server component with DB queries
- `components/dashboard/DashboardAudience.tsx` - Server component with DB queries
- `components/dashboard/organisms/ContactsManager.tsx` - Complex server actions
- `components/dashboard/organisms/GroupedLinksManager.tsx` - Complex server actions
- `components/dashboard/organisms/EnhancedDashboardLinks.tsx` - Server actions
- `components/dashboard/organisms/AccountSettingsSection.tsx` - Clerk integration

### Provider Components
- `components/providers/*` - Context providers, not visual

### Page-Level Components
- `components/profile/StaticArtistPage.tsx` - Full page, requires data
- `components/profile/ProgressiveArtistPage.tsx` - Full page, requires data
- `components/profile/AnimatedListenInterface.tsx` - Requires profile data
- `components/home/ClaimHandleForm.tsx` - Complex form with API calls
- `components/home/NewHomeHero.tsx` - Full hero section with forms

### Thin Wrappers
- `components/home/BenefitsSection.tsx` - Re-exports organism
- `components/home/HowItWorks.tsx` - Re-exports organism
- `components/home/FeaturedArtists.tsx` - Re-exports organism

## Configuration Changes Made

### `.storybook/main.ts`
- Uses `@storybook/nextjs-vite` framework
- Mocks for server-only modules: `next/cache`, `next/headers`, `server-only`
- Mocks for Clerk: `@clerk/nextjs`, `@clerk/nextjs/server`
- Mocks for server actions: `@/app/dashboard/actions`, `@/app/onboarding/actions`
- Mock for Next.js navigation: `next/navigation`

### `.storybook/preview.tsx`
- Global decorators: `ThemeProvider`, `ToastProvider`
- Imports global CSS: `app/globals.css`
- Background options: light, dark, gray
- Next.js App Router support enabled

### `package.json`
- Added Vite 6.x override to fix Storybook compatibility

### New Mock Files
- `.storybook/onboarding-actions-mock.ts` - Mocks for onboarding server actions

## Known Limitations

1. **IDE Lint Warnings**: Some path aliases (`@jovie/ui`, `@/types/db`) show as unresolved in the IDE but work correctly at build time.

2. **Tailwind v4 Suggestions**: `bg-gradient-to-br` vs `bg-linear-to-br` warnings are cosmetic - both syntaxes work.

3. **Large Bundle Size**: Some chunks exceed 500KB. Consider code-splitting for production Storybook builds.

4. **Clerk Components**: Components using Clerk hooks show mocked auth state in Storybook.

## Next Steps

To increase coverage further:
1. Add stories for remaining home/marketing components
2. Add stories for dashboard layout components
3. Consider creating mock data utilities for complex components
4. Add interaction tests using Storybook's `play` function
