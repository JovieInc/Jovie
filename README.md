# Jovie

A modern artist profile and link-in-bio platform built with Next.js, Clerk authentication, Neon PostgreSQL, and Drizzle ORM.

## Security & trust

Jovie tracks OpenSSF security posture in-repository and is working toward an OpenSSF Best Practices badge.

- Best Practices plan: `docs/security/OPENSSF_BEST_PRACTICES.md`
- Badge submission checklist: `docs/security/CII_BADGE_SUBMISSION_CHECKLIST.md`
- Vulnerability reporting: `SECURITY.md`

> Maintainers: once bestpractices.dev enrollment is complete, add the issued badge URL and project ID here.

## Tech Stack

Jovie uses a modern, secure stack designed for scalability, type safety, and exceptional developer experience:

### Core Framework
- **Next.js 16** - React framework with App Router, Server Components, and Server Actions
- **React 19** - Latest React with concurrent features
- **TypeScript 5** - Type-safe development across the entire stack
- **Turborepo 2.8** - Monorepo build system with intelligent caching, shared worktree cache, and `turbo docs` CLI

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

- **Node.js 22.13.0+** (22.x only)
- **pnpm 9.15.4** (exact, via Corepack)
- **ripgrep (`rg`)** for local agent and search tooling
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

2. **Bootstrap the workspace**

   ```bash
   ./scripts/setup.sh
   ```

   This verifies the required Node/pnpm/ripgrep tooling, installs dependencies when package manifests changed, and checks Doppler access.
   On supported macOS and Debian/Ubuntu systems it will attempt to install `ripgrep` automatically. If auto-install is unavailable, use:

   ```bash
   brew install ripgrep  # macOS
   sudo apt-get install -y ripgrep  # Ubuntu/Debian
   ```

### Internal Quickstart

From the repo root, use the root wrappers for the canonical internal workflow:

```bash
pnpm run db:web:migrate
pnpm run dev:web:fast
pnpm run benchmark:dev
pnpm run test:web
pnpm run dev:web:browse
```

`pnpm run dev:web:fast` is the daily coding loop. It pins Doppler to `jovie-web/dev`, enables the local test-auth bypass, disables local Sentry initialization unless `JOVIE_ENABLE_LOCAL_SENTRY=1`, uses `PORT=3100` by default, and prewarms `/`, `/app`, and `/api/health/build-info` after the server is ready.

Useful local speed toggles:

```bash
JOVIE_DEV_RESET_NEXT_CACHE=1 ./scripts/setup.sh
JOVIE_DEV_SYNC_CLERK_IDS=1 ./scripts/setup.sh
JOVIE_ENABLE_LOCAL_SENTRY=1 pnpm run dev:web:fast
JOVIE_DEV_RESET_NEXT_CACHE=1 pnpm run benchmark:dev
```

For authenticated local browser QA, open:

```text
/api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings
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

4. **Manual Environment Setup (Non-Canonical Fallback)**

   Internal team and agent workflows should use Doppler plus the root wrapper commands above. Only use a manual `.env.local` flow if you explicitly need to run outside the standard internal setup:

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

5. **Run database migrations**

   ```bash
   pnpm run db:web:migrate
   ```

6. **Start the development server**

   ```bash
   pnpm run dev:web:fast
   ```

   Open [http://localhost:3100](http://localhost:3100) in your browser.

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
pnpm --filter=@jovie/web run drizzle:check

# Generate migrations from schema changes
pnpm --filter=@jovie/web run drizzle:generate

# Run migrations on main branch
pnpm run db:web:migrate

# Open Drizzle Studio (database GUI)
pnpm run db:web:studio

# Note: Migrations are APPEND-ONLY - never modify existing migrations
```

### Testing

```bash
# Web app test suite with pinned Doppler scope
pnpm run test:web

# Changed web tests for quick local iteration
pnpm run test:web:changed

# Web smoke suite
pnpm run test:web:smoke

# Web E2E suite
pnpm run test:web:e2e

# Workspace-wide fast unit tests
pnpm test:fast
```

### Code Quality

```bash
# Fast web typecheck for local iteration
pnpm run typecheck:web:fast

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

# Dev server ready, first-route compile, and warm-route timing
pnpm run benchmark:dev
```

### Turborepo

```bash
# Search Turborepo docs from terminal (2.8+)
turbo docs "task configuration"

# Run only affected packages (CI optimization)
pnpm turbo build --affected
pnpm turbo test --affected

# Preview task execution plan without running
pnpm turbo build --dry

# Reduce memory pressure for tests (OOM fix)
pnpm turbo test --concurrency=1
```

### Parallel Development with Worktrees

Git worktrees enable parallel agent work with shared Turbo cache (2.8+):

```bash
# Create a worktree for parallel work
git worktree add ../Jovie-agent-1 -b agent/task-name
cd ../Jovie-agent-1 && ./scripts/setup.sh

# Work normally -- turbo cache is shared automatically
pnpm turbo build

# Clean up
git worktree remove ../Jovie-agent-1
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
doppler run --project jovie-web --config prd -- pnpm --filter @jovie/web run drizzle:migrate
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
4. **Test** - Ensure all tests pass: `pnpm run test:web && pnpm typecheck`
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

## Security

- **Security Policy** - [SECURITY.md](SECURITY.md)
- **Security Reviews** - [docs/security/](docs/security)
- **OpenSSF Best Practices Plan** - [docs/security/OPENSSF_BEST_PRACTICES.md](docs/security/OPENSSF_BEST_PRACTICES.md)

## License

This project is proprietary and confidential. All rights reserved by Jovie Technology Inc.

See [LICENSE](LICENSE) for full terms. Unauthorized copying, distribution, or use of this software is strictly prohibited.

### Release Versioning & Changelog

Jovie uses Calendar Versioning (`YY.M.PATCH`) tracked in `version.json` and mirrored to all workspace `package.json` files.

```bash
# Validate versioning integrity (calendar, workspace sync, changelog consistency)
pnpm version:check
```

Version bumps and changelog entries are handled automatically by the `/ship` workflow. `CHANGELOG.md` uses `merge=union` in `.gitattributes` to auto-resolve merge conflicts between concurrent PRs.
