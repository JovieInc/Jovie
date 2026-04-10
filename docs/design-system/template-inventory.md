# Template Inventory

This inventory defines the current page-template families and the canonical shell/template owner for each.

## Marketing landing page

- Route examples: `/`, `/new`, `/tips`, `/launch`
- Shell owner: `PublicPageShell`
- Container width policy: `MarketingContainer width='landing'` or homepage-specific temporary wrappers
- Intro pattern: `MarketingHero` or homepage section intro family
- CTA pattern: shared public primary/secondary/inline actions
- Empty/error/loading: route-local loading pages where present
- Mobile collapse behavior: stacked hero/content, shared fixed-header offset

## Marketing detail page

- Route examples: `/about`, `/compare/[slug]`, `/alternatives/[slug]`, `/artist-profiles`
- Shell owner: `PublicPageShell`
- Container width policy: `MarketingContainer width='page'`
- Intro pattern: `MarketingHero variant='left'` or `MarketingSectionIntro`
- CTA pattern: shared public primary/secondary/inline actions
- Empty/error/loading: route-local loading states
- Mobile collapse behavior: single-column stacking, no page-local horizontal overflow

## Pricing page

- Route examples: `/pricing`, `/launch/pricing`
- Shell owner: `PublicPageShell`
- Container width policy: `MarketingContainer width='page'`
- Intro pattern: `MarketingHero variant='centered'`
- CTA pattern: shared primary and secondary public actions
- Empty/error/loading: N/A for static pricing page
- Mobile collapse behavior: comparison chart switches to plan selector pattern

## Support page

- Route examples: `/support`
- Shell owner: `PublicPageShell`
- Container width policy: custom narrow content inside `MarketingContainer`-compatible spacing
- Intro pattern: `MarketingHero variant='left'`
- CTA pattern: inline public action links plus one primary contact action
- Empty/error/loading: route loading page
- Mobile collapse behavior: channels stack from three-column to single-column

## Legal document page

- Route examples: `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/dmca`
- Shell owner: `PublicPageShell`
- Container width policy: `MarketingContainer width='page'`
- Intro pattern: `DocPage` + `LegalHero`
- CTA pattern: `DocToolbar` and support block link
- Empty/error/loading: route loading pages
- Mobile collapse behavior: TOC sidebar collapses away on compact widths

## Blog/docs-style article

- Route examples: `/blog/[slug]`, `/blog/authors/[username]`, investor memo routes
- Shell owner: `PublicPageShell`
- Container width policy: `MarketingContainer width='page'`
- Intro pattern: route-specific article header, converging toward public document contract
- CTA pattern: inline links and shared TOC/document actions
- Empty/error/loading: blog fallback states, route loading pages where present
- Mobile collapse behavior: TOC hidden below large breakpoint, content stays single-column

## Auth page

- Route examples: `/signin`, `/signup`, SSO callback routes
- Shell owner: `apps/web/components/features/auth/AuthLayout.tsx`
- Container width policy: `AUTH_FORM_MAX_WIDTH_CLASS`
- Intro pattern: shell title + optional branding
- CTA pattern: auth footer prompt and primary form submit
- Empty/error/loading: unavailable and loading states in auth feature set
- Mobile collapse behavior: keyboard-aware fixed shell, hidden branding/title when needed

## Public profile page

- Route examples: `/[username]`, `/[username]/listen`, `/[username]/tour`, `/[username]/tip`
- Shell owner: `ProfileShell` via `ArtistPageShell`
- Container width policy: profile shell max width contract, usually `max-w-md`
- Intro pattern: profile hero module
- CTA pattern: `ProfilePrimaryCTA`
- Empty/error/loading: profile not found, no release, no tour, no tips, notifications unavailable
- Mobile collapse behavior: drawer- and mode-based shell

## Internal dashboard index/detail/settings/admin

- Route examples: `/app/dashboard`, `/app/settings/profile`, `/app/admin`
- Shell owner: `AppShellFrame` + `AppShellContentPanel`
- Container width policy: panel `maxWidth` variants
- Intro pattern: page toolbar or content panel heading row
- CTA pattern: internal button/link/status action patterns
- Empty/error/loading: route and component loading skeletons
- Mobile collapse behavior: app shell sidebar/nav collapse and bottom-nav behavior where applicable
