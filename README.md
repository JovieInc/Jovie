# Jovie

A modern artist profile and link-in-bio platform built with Next.js, Clerk authentication, Neon PostgreSQL, and Drizzle ORM.

## Tech Stack

Jovie uses a modern, secure stack designed for scalability, type safety, and exceptional developer experience:

### Core Framework
- **Next.js 16** - React framework with App Router, Server Components, and Server Actions
- **React 19** - Latest React with concurrent features
- **TypeScript 5** - Type-safe development across the entire stack
- **Turborepo** - Monorepo build system with intelligent caching

### Authentication & Security
- **Clerk 7** - Complete user management with social login, MFA, and webhooks
- **Doppler** - Centralized secrets management with audit logging (see [docs/DOPPLER_SETUP.md](docs/DOPPLER_SETUP.md))

### Database & ORM
- **Neon PostgreSQL** - Serverless Postgres with branching and autoscaling
- **Drizzle ORM 0.45** - Type-safe SQL with edge runtime support
- **Connection Pooling** - @neondatabase/serverless with optimized pooling

### Payments & Billing
- **Stripe** - Payment processing with subscriptions and webhooks
- **RevenueCat** - Cross-platform subscription management (mobile)

### Analytics & Feature Flags
- **Statsig** - Feature flags, A/B testing, and analytics
  - `@statsig/react-bindings` - React integration
  - `@statsig/session-replay` - User session recording
  - `@statsig/web-analytics` - Web analytics tracking

### Error Tracking & Monitoring
- **Sentry 10** - Error tracking, performance monitoring, and session replay
- **Vercel Analytics** - Web vitals and performance metrics

### UI & Styling
- **Tailwind CSS 4** - Utility-first CSS with JIT compiler
- **Radix UI** - Accessible, unstyled component primitives
- **Headless UI** - Accessible UI components
- **next-themes** - Theme management (dark/light mode)
- **Biome** - Fast linter and formatter (replaces ESLint + Prettier)

### Testing
- **Vitest** - Fast unit testing with Vite
- **Playwright** - End-to-end testing with browser automation
- **@testing-library/react** - React component testing utilities

### Infrastructure & Deployment
- **Vercel** - Hosting and edge functions with automatic previews
- **GitHub Actions** - CI/CD with automated testing and deployment
- **Neon Branching** - Database branch per PR for isolated testing

### Media & Assets
- **Cloudinary** - Image and video hosting with transformations
- **Vercel Blob Storage** - File storage for user uploads

## Key Features

- 🎵 **Artist Profiles** - Customizable profile pages with themes and branding
- 🔗 **Link-in-Bio** - Centralized link hub with click tracking
- 💸 **Tipping & Payments** - Integrated Stripe payments with subscription support
- 📊 **Analytics Dashboard** - Real-time creator analytics with Statsig
- 🔐 **Row Level Security** - Database-level security with Clerk JWT integration
- 📱 **Mobile Optimized** - Responsive design with touch-friendly UI
- ⚡ **Edge Performance** - Server-side rendering with edge optimization
- 🌙 **Dark Mode** - System-aware theme switching
- 🎭 **Feature Flags** - Gradual rollouts with Statsig
- 📈 **Session Replay** - Debug user issues with Statsig session replay

## Getting Started

### Prerequisites

- **Node.js 24+** (LTS)
- **pnpm 8.0.0+** (package manager)
- **Doppler CLI** (secrets management) - [Install Guide](docs/DOPPLER_SETUP.md)
- **Accounts Required:**
  - [Neon](https://neon.tech/) - PostgreSQL database
  - [Clerk](https://clerk.com/) - Authentication
  - [Stripe](https://stripe.com/) - Payments
  - [Doppler](https://doppler.com/) - Secrets management
  - [Statsig](https://statsig.com/) - Feature flags & analytics (optional)
  - [Sentry](https://sentry.io/) - Error tracking (optional)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/JovieInc/Jovie.git
   cd Jovie
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up Doppler (Recommended)**

   Follow the [Doppler setup guide](docs/DOPPLER_SETUP.md):

   ```bash
   # Install Doppler CLI
   brew install dopplerhq/cli/doppler  # macOS

   # Authenticate
   doppler login

   # Configure project
   doppler setup --project jovie-web --config dev
   ```

4. **Alternative: Manual Environment Setup**

   If not using Doppler, copy `.env.example` to `.env.local`:

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

5. **Run database migrations**

   ```bash
   # With Doppler
   doppler run -- pnpm drizzle:migrate:main

   # Or without Doppler
   pnpm drizzle:migrate:main
   ```

6. **Start the development server**

   ```bash
   # With Doppler (recommended)
   doppler run -- pnpm dev

   # Or without Doppler
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

### Monorepo Structure

```text
Jovie/
├── apps/
│   ├── web/              # Main Next.js application
│   └── should-i-make/    # Side project
├── packages/
│   └── ui/               # Shared UI components
├── drizzle/
│   ├── migrations/       # Database migrations (append-only)
│   └── migrations/_journal.json
└── docs/                 # Documentation
```

### Database Management

```bash
# Check schema matches database
pnpm drizzle:check:main

# Generate migrations from schema changes
pnpm drizzle:generate

# Run migrations on main branch
pnpm drizzle:migrate:main

# Open Drizzle Studio (database GUI)
pnpm drizzle:studio

# Note: Migrations are APPEND-ONLY - never modify existing migrations
```

### Testing

```bash
# Unit tests (fast)
pnpm test:fast

# All tests
pnpm test

# E2E smoke tests
pnpm e2e:smoke

# E2E full suite
pnpm test:e2e

# E2E with UI
pnpm test:e2e:ui

# Profile tests
pnpm test:profile
```

### Code Quality

```bash
# Type checking
pnpm typecheck

# Linting (Biome)
pnpm lint
pnpm lint:fix

# Code formatting (Biome)
pnpm format
pnpm format:check

# Tailwind CSS check
pnpm tailwind:check
```

### CI/CD

The project uses **trunk-based development**:

- **Main Branch** → deploys directly to production (`jov.ie`)
- **PR Checks** - Fast validation (typecheck, lint) - ~30 seconds
- **Post-Merge** - Full CI (build, tests, E2E) then deploy
- **Canary Gate** - Health check before deployment success
- **Smoke Tests** - Production validation after deploy

See [.github/workflows/README.md](.github/workflows/README.md) for workflow details.

## Environment Variables

### Using Doppler (Recommended)

All secrets are managed in Doppler with automatic sync to Vercel and GitHub Actions.

**Environments:**
- `dev` - Local development
- `stg` - Staging/preview
- `prd` - Production

**See:** [docs/DOPPLER_SETUP.md](docs/DOPPLER_SETUP.md)

### Manual Setup (Fallback)

Create `.env.local` with the following:

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Neon Database
DATABASE_URL=postgresql://...

# Stripe Payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Statsig (Feature Flags & Analytics)
NEXT_PUBLIC_STATSIG_CLIENT_KEY=client-...
STATSIG_SERVER_API_KEY=secret-...

# Sentry (Error Tracking)
SENTRY_AUTH_TOKEN=...
NEXT_PUBLIC_SENTRY_DSN=https://...

# Optional: Cloudinary (Media)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

See `.env.example` for complete list.

## Deployment

### Vercel (Production)

1. **Connect Repository** - Link GitHub repo to Vercel
2. **Configure Environment** - Doppler auto-syncs to Vercel
3. **Deploy** - Automatic on push to `main`

**Environments:**
- **Production** - `jov.ie` (main branch)
- **Preview** - Automatic for all PRs

### Database Migrations

**In CI/CD:**
```bash
# Migrations run automatically in CI after merge to main
# See .github/workflows/ci.yml
```

**Manual (Production):**
```bash
export ALLOW_PROD_MIGRATIONS=true
doppler run --config prd -- pnpm drizzle:migrate:main
```

## Monitoring & Observability

### Performance
- **Vercel Analytics** - Core Web Vitals, page performance
- **Statsig Web Analytics** - User behavior, feature adoption
- **Sentry Performance** - Backend performance, slow queries

### Errors
- **Sentry** - Error tracking, stack traces, user context
- **Clerk Dashboard** - Authentication errors, login analytics
- **Neon Dashboard** - Database errors, connection issues

### Feature Flags
- **Statsig Console** - Feature rollouts, A/B tests, metrics
- **Session Replay** - User session recordings for debugging

## Database Schema

### Core Tables

- `users` - User accounts (synced with Clerk)
- `creator_profiles` - Artist/creator profile data
- `social_links` - Social media and platform links
- `click_events` - Link click tracking and analytics
- `tips` - Payment records and transaction history
- `notification_subscriptions` - Push notification preferences

### Row Level Security (RLS)

All tables use PostgreSQL RLS with Clerk JWT integration:

- Users can only access their own data
- Public profiles respect visibility settings
- Analytics allow anonymous tracking
- Webhook endpoints bypass RLS with service keys

## Migration History

This project has evolved through several migrations:

1. **Supabase → Neon + Clerk** (2025)
   - Auth: Supabase Auth → Clerk
   - Database: Supabase PostgreSQL → Neon PostgreSQL
   - ORM: Supabase client → Drizzle ORM

2. **Secrets Management** (Dec 2025)
   - `.env` files → Doppler centralized secrets

3. **Trunk-Based Development** (Dec 2025)
   - Removed staging branch
   - Main deploys directly to production
   - Fast CI for PRs, full CI post-merge

## Contributing

1. **Fork** the repository
2. **Create branch** - `feat/your-feature` or `fix/your-bug`
3. **Commit format** - Use conventional commits:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `chore:` - Maintenance tasks
   - `docs:` - Documentation updates
4. **Test** - Ensure all tests pass: `pnpm test:fast && pnpm typecheck`
5. **Submit PR** - PRs auto-run fast CI checks

### Code Review Process

- **CodeRabbit** - Automated AI code review
- **Required Checks** - Typecheck, lint, fast tests
- **Auto-Merge** - Enabled for Dependabot and approved PRs

## Support

- **Documentation** - Check [/docs](/docs) directory
- **Issues** - [GitHub Issues](https://github.com/JovieInc/Jovie/issues)
- **Doppler Setup** - [docs/DOPPLER_SETUP.md](docs/DOPPLER_SETUP.md)
- **CI/CD** - [.github/workflows/README.md](.github/workflows/README.md)

## License

This project is proprietary and confidential.

### Release Versioning & Changelog

Jovie uses Calendar Versioning (`YY.M.PATCH`) tracked in `version.json` and mirrored to all workspace `package.json` files.

```bash
# Validate versioning integrity (calendar, workspace sync, changelog consistency)
pnpm version:check

# Bump to next calendar-aware version and rotate changelog
pnpm version:bump
```

`pnpm version:bump` now:
- Uses UTC calendar month/year to prevent timezone drift
- Increments patch only within the same month
- Resets patch to `0` when the month changes
- Refuses empty releases unless `--allow-empty` is provided
- Rotates `[Unreleased]` into a dated release and scaffolds a fresh unreleased template
