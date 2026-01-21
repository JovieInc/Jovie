# GitHub Copilot Instructions for Jovie

**ALWAYS follow these instructions first and only fallback to additional search and context gathering if the information here is incomplete or found to be in error.**

This repository uses GitHub Copilot (including the Coding Agent) to propose and implement small, focused changes via Pull Requests. These instructions provide comprehensive guidance for working in the Jovie codebase like a developer would after acquiring a fresh clone.

## Repository Overview

- **Stack**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4
- **Auth**: Clerk (migrated from Supabase Auth)
- **Database**: Neon PostgreSQL with Drizzle ORM (migrated from Supabase)
- **Package Manager**: pnpm 9.15.4 (exact version required - NOT npm or yarn)
- **Node.js**: 24.0.0 required (see `.nvmrc`)
- **Env validation**: `lib/env.ts` (Zod-based validation)
- **Branches**: `develop` (work) → `preview` (staging) → `production`
- **CI gates**: `lint`, `typecheck`, `test`, `build`, and e2e

> **IMPORTANT FOR AI AGENTS**: Verify `node --version` shows v24.x and `pnpm --version` shows 9.15.4 BEFORE running any commands. Using older Node versions will cause failures.

## Critical Setup Requirements

### Prerequisites
- **Node.js 24.0.0**: Required version (check `.nvmrc`). Use `nvm use 24` or `nvm install 24`
- **pnpm 9.15.4**: Exact version required (not npm or yarn)
- **Environment Variables**: Copy `.env.example` to `.env.local` and configure

### Initial Setup Commands
Run these commands in order for a fresh repository clone:

```bash
# 0. VERIFY NODE VERSION FIRST (must be v24.x)
node --version  # Expected: v24.0.0

# 1. Ensure exact pnpm version via Corepack
corepack enable pnpm
corepack prepare pnpm@9.15.4 --activate

# 2. Install dependencies (TIMING: ~60-90 seconds)
# NOTE: Use --no-frozen-lockfile due to lockfile sync issues
pnpm install --no-frozen-lockfile

# 3. Copy environment template
cp .env.example .env.local
# EDIT .env.local with your credentials (see Environment Variables section)

# 4. Start development server (TIMING: ~1.5 seconds)
pnpm run dev
```

### Critical Timeout Requirements
**⚠️ NEVER CANCEL BUILD OR TEST COMMANDS ⚠️**

- **Build**: Set timeout to **75+ minutes**. Builds may take 45+ minutes normally
- **Tests**: Set timeout to **45+ minutes**. Test suite may take 15+ minutes  
- **pnpm install**: Set timeout to **10+ minutes**. Usually ~60-90 seconds
- **Database migrations**: Set timeout to **15+ minutes**

## Current Repository State (2025-01-12)

### ✅ Working Commands
- `pnpm run dev` - Development server (starts in ~1.5s)
- `pnpm install --no-frozen-lockfile` - Dependency installation (~60s)

### ❌ Currently Broken Commands  
- `pnpm run build` - Fails due to network issues (fonts.googleapis.com) and Next.js SSR problems
- `pnpm run typecheck` - Fails with 33 TypeScript errors across auth, UI components
- `pnpm run lint` - Fails with 17 ESLint errors, mainly unused variables
- `pnpm test` - Fails with multiple test failures (database setup issues)

**When encountering these issues**: Document failures but continue with development workflow using `pnpm run dev`. These are known issues in the current codebase state.

## Environment Variables

**Critical Environment Variables** (required for basic functionality):
```bash
# Clerk Authentication (REQUIRED)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Neon Database (REQUIRED for DB operations)  
DATABASE_URL=postgresql://...

# Stripe (for billing features)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Optional but recommended
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Environment Validation**: The app uses `lib/env.ts` for centralized environment validation with Zod. Always use `env` from this module instead of `process.env`.

## Definition of Done

- Code compiles and development server runs without critical errors
- **Note**: lint/typecheck/build/test may fail due to current repository state
- No console errors/warnings on touched routes (check dev server)
- Update `windsurf.plan.md` or reference the plan item in PR body
- Adhere to accessibility (a11y) and design consistency

## Conventions and Best Practices

### Code Standards
- **Commit messages**: Conventional Commits (e.g., `feat(ui): center nav links`, `fix(auth): resolve token refresh`)
- **PRs**: Small, focused changes; include before/after screenshots for UI changes
- **Styling**: Tailwind CSS v4 utility-first; prefer existing design tokens/classes
- **TypeScript**: Strict mode enabled; avoid `any` types, use proper interfaces
- **Components**: Functional components with hooks; follow atomic design principles

### Security and Environment  
- **Secrets**: Never print or commit secrets; do not commit `.env*` files
- **Environment**: Always use `env` from `lib/env.ts` for validated environment variables
- **Authentication**: Use Clerk's native integration patterns (see CONTRIBUTING.md)
- **Database**: All tables use RLS with Clerk JWT integration

### Accessibility and Design
- **Accessibility**: Preserve focus-visible, aria-labels, color contrast ratios
- **Responsive**: Mobile-first design; test all breakpoints
- **Dark mode**: Support both light and dark themes consistently
- **Performance**: Optimize images, lazy load components, minimize bundle size

## Common Development Tasks

### Adding New Features
1. **Plan in windsurf.plan.md**: Document feature scope and tasks
2. **Database first**: Add schema changes to `lib/db/schema.ts`
3. **Generate migration**: `pnpm run drizzle:generate`
4. **Apply migration**: `pnpm run drizzle:migrate`  
5. **Build components**: Follow atomic design patterns
6. **Add tests**: Unit tests for logic, integration for user flows
7. **Manual validation**: Test complete user scenarios

### Debugging Database Issues
1. **Check connection**: `pnpm run drizzle:studio` for GUI access
2. **Validate environment**: Check `lib/env.ts` validation results
3. **Test queries**: Use `scripts/test-db-connection.ts`
4. **Review migrations**: Check `drizzle/migrations/` for recent changes

### Working with Authentication  
1. **Use Clerk patterns**: See existing auth components in `app/(auth)/`
2. **Server-side auth**: Use `auth()` from `@clerk/nextjs/server`  
3. **Client-side auth**: Use `useUser()` and `useSession()` hooks
4. **Database integration**: User data synced via webhooks to `users` table

### Styling and UI Components
1. **Design system**: Check `packages/ui/` for reusable components
2. **Tailwind config**: See `tailwind.config.ts` for custom tokens
3. **Component patterns**: Follow existing patterns in `components/atoms/`
4. **Icons**: Use Lucide React icons consistently

## Repository Architecture and Key Paths

### Core Application Structure
```
app/                          # Next.js App Router
├── (auth)/                   # Authentication pages (signin, signup)
├── (marketing)/              # Public marketing pages  
├── [username]/               # Dynamic profile pages
├── dashboard/                # Protected dashboard area
├── api/                      # API routes
└── layout.tsx               # Root layout

components/                   # React components  
├── atoms/                    # Basic UI components
├── molecules/               # Compound components
├── organisms/               # Complex page sections
├── dashboard/               # Dashboard-specific components
├── home/                    # Homepage components
├── profile/                 # Profile page components
└── providers/               # React context providers

lib/                         # Utility libraries
├── db/                      # Database configuration and queries
├── auth/                    # Clerk authentication utilities
├── env.ts                   # Environment variable validation (USE THIS)
├── stripe/                  # Stripe payment integration
└── utils/                   # General utilities

drizzle/                     # Database migrations and schema
scripts/                     # Build and maintenance scripts  
tests/                       # Test suites (unit, e2e, integration)
```

### Important Files to Know
- **`lib/env.ts`** - Environment variable validation (ALWAYS use `env` from here)
- **`lib/db/schema.ts`** - Database schema definitions
- **`drizzle.config.ts`** - Database migration configuration
- **`app/layout.tsx`** - Root layout with providers
- **`app/dashboard/page.tsx`** - Main dashboard (requires auth)
- **`components/DebugBanner.tsx`** - Developer diagnostics banner
- **`package.json`** - Dependencies and scripts
- **`.env.example`** - Environment variable template

### Database Architecture (Neon + Drizzle)
- **Migration recent**: Recently migrated from Supabase to Neon PostgreSQL
- **ORM**: Uses Drizzle ORM for type-safe database operations  
- **Auth Integration**: Clerk JWT tokens integrated with RLS policies
- **Core Tables**: `users`, `creator_profiles`, `social_links`, `click_events`, `tips`
- **Migrations**: Located in `drizzle/migrations/`, managed via `scripts/drizzle-migrate.ts`

## Useful Paths for Quick Navigation

### Frontend Development
- **`app/(marketing)/page.tsx`** - Homepage with featured artists
- **`app/dashboard/page.tsx`** - Main dashboard (fetches Clerk user → Neon database)
- **`app/[username]/page.tsx`** - Public profile pages
- **`components/home/FeaturedArtists.tsx`** - Homepage featured section
- **`components/dashboard/`** - Dashboard-specific components

### Backend/API Development  
- **`app/api/`** - API routes for various features
- **`lib/db/queries.ts`** - Database query functions
- **`lib/auth/`** - Clerk authentication helpers
- **`middleware.ts`** - Clerk auth middleware configuration

### Development Tools
- **`scripts/drizzle-migrate.ts`** - Database migration runner
- **`scripts/drizzle-seed.ts`** - Database seeding
- **`tests/`** - Unit, integration, and E2E tests
- **`.github/workflows/`** - CI/CD pipeline definitions

## Development Workflow

### Daily Development Commands
```bash
# Start development (primary workflow)
pnpm run dev                    # ~1.5s - starts Next.js dev server on :3000

# Code quality (currently failing - known issues)
pnpm run typecheck             # ~18s - TypeScript type checking (33 errors currently)
pnpm run lint                  # ~62s - ESLint + Biome linting (17 errors currently)  
pnpm run lint:fix              # Attempt to auto-fix linting issues

# Testing (currently failing - missing DB setup)
pnpm test                      # ~48s - Vitest unit tests (many failures currently)
pnpm run test:watch            # Watch mode for development
pnpm run test:fast             # Faster test subset
pnpm run test:e2e              # Playwright E2E tests (requires dev server)

# Database operations (Drizzle + Neon)
pnpm run drizzle:generate      # Generate migrations from schema changes
pnpm run drizzle:migrate       # Apply migrations to database
pnpm run drizzle:studio        # Open Drizzle Studio (database GUI)
pnpm run db:seed               # Seed database with test data

# Build (currently failing - network + SSR issues)
pnpm run build                 # ~31s - Next.js production build (fails currently)
```

### Manual Validation Scenarios
After making changes, **ALWAYS test these user scenarios manually**:

1. **Authentication Flow**:
   - Visit `/signin` and `/signup` 
   - Test login with test user account
   - Verify dashboard access after login

2. **Profile Creation**:
   - Create user profile from onboarding
   - Add social links and bio  
   - Test profile customization

3. **Link Management**:
   - Add/edit/delete links in dashboard
   - Test drag-and-drop reordering
   - Verify mobile responsiveness of link display

4. **Public Profile View**:
   - Visit `/[username]` page  
   - Test link clicks and analytics tracking
   - Verify mobile and desktop layouts

## Running Locally (CI Parity)

**Note**: Full CI parity not currently achievable due to repository state. Focus on development server validation.

- **Install**: `pnpm install --no-frozen-lockfile` (~60s)
- **Dev Server**: `pnpm run dev` (~1.5s)  
- **Lint**: `pnpm run lint` (currently fails with 17 errors)
- **Types**: `pnpm run typecheck` (currently fails with 33 errors)
- **Tests**: `pnpm test` (currently fails, many broken tests)
- **Build**: `pnpm run build` (currently fails, network + SSR issues)

### Validation Workflow for Changes
1. **Start with dev server**: `pnpm run dev` and verify application loads
2. **Test your changes**: Navigate to affected pages and test functionality  
3. **Check browser console**: Ensure no new errors/warnings introduced
4. **Test mobile view**: Use browser dev tools responsive mode
5. **Run manual scenarios**: Execute relevant user workflows from list above

## Branch Strategy and CI/CD

### Branch Protection Rules
- **⚠️ NEVER PUSH DIRECTLY TO `preview` OR `production` BRANCHES**
- **Development workflow**: Create feature branches from `develop`
- **Auto-promotion**: `develop` → `preview` → `production` via CI/CD
- **Branch protection**: Direct pushes to protected branches will be rejected

### CI/CD Pipeline Timing
- **Lint/Typecheck**: ~60-90 seconds (parallel execution)
- **Build**: 15-30 minutes with caching, **up to 75 minutes** without cache
- **Unit Tests**: 15-30 minutes depending on suite size
- **E2E Tests**: 20-45 minutes depending on test coverage
- **Database migrations**: 5-15 minutes (includes Neon branch creation)

### Testing Strategy
- **Unit Tests**: Vitest with jsdom environment
- **Integration Tests**: API endpoint testing with mocked dependencies  
- **E2E Tests**: Playwright across multiple browsers
- **Performance Tests**: Custom performance monitoring and budgets

## Known Issues and Workarounds

### Current Build Issues (as of 2025-01-12)
1. **Network failures**: Google Fonts (fonts.googleapis.com) access blocked
   - **Workaround**: Use local font files or system fonts for development
   
2. **Next.js SSR errors**: `ssr: false` not allowed in Server Components  
   - **Workaround**: Move dynamic imports with `ssr: false` to Client Components
   
3. **TypeScript errors**: 33 errors across auth and UI components
   - **Workaround**: Focus on new code; existing errors are tracked technical debt

4. **Test failures**: Database connection and setup issues  
   - **Workaround**: Use development server testing; unit tests need DB setup fixes

### Dependency Issues
- **pnpm lockfile**: Requires `--no-frozen-lockfile` flag due to sync issues
- **Peer dependencies**: Zod version mismatch warnings (non-blocking)
- **@types/dompurify**: Deprecated package warnings (non-blocking)

## Troubleshooting Guide

### Development Server Won't Start
1. **Check Node version**: Must be 24.0.0+ (`node --version`)
2. **Check pnpm version**: Must be exactly 9.15.4 (`pnpm --version`)
3. **Reinstall dependencies**: `rm -rf node_modules pnpm-lock.yaml && pnpm install --no-frozen-lockfile`
4. **Check environment**: Verify `.env.local` has required variables

### Database Connection Issues
1. **Validate DATABASE_URL**: Check format in `lib/env.ts`
2. **Test connection**: `pnpm run scripts/test-db-connection.ts`
3. **Check Neon status**: Verify database is accessible
4. **Review migrations**: Ensure migrations are applied

### Authentication Problems
1. **Check Clerk config**: Verify publishable key in environment
2. **Clear browser data**: Clear cookies and local storage
3. **Test in incognito**: Rule out browser state issues
4. **Review middleware**: Check `middleware.ts` configuration

### Build/Deploy Failures
1. **Check timeout settings**: Ensure 75+ minute timeouts for builds
2. **Review network access**: Verify external service availability  
3. **Check environment**: Ensure all required variables are set
### Build/Deploy Failures
1. **Check timeout settings**: Ensure 75+ minute timeouts for builds
2. **Review network access**: Verify external service availability  
3. **Check environment**: Ensure all required variables are set
4. **Review logs**: CI/CD logs provide detailed error information

## PR Quality Checklist for Copilot

### Before Creating PR
- [x] **Development server tested**: Changes work in `pnpm run dev`
- [x] **Manual validation completed**: Relevant user scenarios tested
- [x] **No new console errors**: Browser dev tools show no new errors/warnings
- [x] **Mobile responsive**: Tested in browser responsive mode
- [x] **Environment variables**: No hardcoded secrets or environment dependencies

### Code Quality (adapt to current repository state)
- **Keep diffs minimal** and targeted to the specific issue
- **Attempt linting**: Run `pnpm run lint:fix` to auto-fix what possible  
- **Check TypeScript**: Run `pnpm run typecheck` and ensure no NEW errors introduced
- **Maintain responsive design** and dark mode parity
- **Prefer composition** over duplication; reuse existing components

### Documentation and Planning
- **Update windsurf.plan.md** or reference the plan item in PR body
- **Include screenshots** for UI changes (before/after)
- **Document breaking changes** if any API or component interfaces change
- **Reference issue numbers** using GitHub's "Fixes #123" syntax

## Examples of Good Copilot Tasks

### Low-Risk UI/UX Improvements
- Tailwind spacing/size tweaks and layout alignment improvements
- Accessibility improvements (aria-labels, focus management, color contrast)
- Simple component refactors without changing data flow or business logic  
- Replacing ad-hoc loaders with reusable loading components
- Updating footer/header link sets and consistent styling

### Safe Code Improvements  
- Type safety improvements for existing components
- Performance optimizations (image optimization, lazy loading)
- Error handling improvements for user-facing features
- Consistent styling and design token usage across components

## Non-Goals for Copilot (require human review)

### High-Risk Changes
- **Database schema changes**: Migrations, RLS policy changes, new tables
- **Authentication flow modifications**: Clerk configuration, JWT handling, session management
- **Billing/payment logic**: Stripe integration, subscription management, pricing changes
- **Performance-critical paths**: Core routing, middleware, authentication middleware

### Complex Business Logic
- **Onboarding flow changes**: User signup, profile creation, handle claiming
- **Analytics and tracking**: Event tracking, user behavior analysis
- **Third-party integrations**: Spotify API, Cloudinary, external service connections
- **Security implementations**: Rate limiting, input validation, data sanitization

## Labels and Assignment

- **Labels**: `mvp`, `agent:copilot`, and `area:*` (e.g., `area:landing`, `area:ui`, `area:fix`)
- **Assignment**: `github-copilot` (the coding agent) or use repository automation
- **Priority**: Use GitHub issue/PR templates for priority and complexity assessment

## Development Notes and Gotchas

### Critical Development Guidelines
- **Debug Banner**: Should be non-noisy; only show actionable information for developers
- **Profile pages**: `/[username]` pages must render without hydration errors
- **Authentication flow**: Sign-up/handle claim flow must be seamless (avoid redundant handle requests)
- **Mobile-first**: Always test mobile layouts; this is a link-in-bio platform primarily used on mobile

### Performance Considerations  
- **Image optimization**: Use Next.js Image component for all user-uploaded content
- **Bundle size**: Monitor bundle size impact of new dependencies
- **Core Web Vitals**: Maintain good performance scores, especially on mobile
- **Database queries**: Use efficient queries; check query plans in Drizzle Studio

### Testing Philosophy
- **Development server testing**: Primary validation method given current test failures
- **Manual scenario testing**: Critical for user-facing changes
- **Browser testing**: Test across Chrome, Firefox, Safari when possible
- **Mobile testing**: Use browser dev tools or real devices for mobile-specific features

## Quick Reference: Common Commands

```bash
# Daily development workflow
pnpm run dev                     # Start development server (1.5s)
pnpm run drizzle:studio         # Open database GUI
pnpm run lint:fix               # Auto-fix linting issues

# Database operations  
pnpm run drizzle:generate       # Generate new migrations
pnpm run drizzle:migrate        # Apply pending migrations
pnpm run db:seed               # Seed with test data

# Testing (when working)
pnpm test                       # Run unit tests
pnpm run test:e2e              # Run E2E tests (requires dev server)

# Code quality (currently failing but useful to try)
pnpm run typecheck             # TypeScript validation
pnpm run lint                  # Full linting check
pnpm run build                 # Production build
```

---

**Remember**: Always start with these instructions and adapt based on the current repository state. When in doubt, prioritize the development server workflow (`pnpm run dev`) and manual testing over automated checks until the repository's build/test infrastructure is stabilized.
