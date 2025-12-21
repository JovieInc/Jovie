# Jovie

A modern artist profile and link-in-bio platform built with Next.js, Clerk authentication, Neon PostgreSQL, and Drizzle ORM.

## Architecture

Jovie uses a modern, secure stack designed for scalability and type safety:

- **Frontend**: Next.js 15 with TypeScript
- **Authentication**: Clerk for secure user management
- **Database**: Neon PostgreSQL with connection pooling
- **ORM**: Drizzle ORM for type-safe database operations
- **Styling**: Tailwind CSS with custom components
- **Testing**: Vitest + Playwright for comprehensive testing

## Key Features

- 🎵 Artist profile pages with customizable themes
- 🔗 Link-in-bio functionality with click tracking
- 💸 Integrated tipping with Stripe
- 📊 Analytics dashboard for creators
- 🔐 Row Level Security (RLS) for data protection
- 📱 Mobile-optimized responsive design
- ⚡ Server-side rendering with edge optimization

## Getting Started

### Prerequisites

- Node.js 20.17+
- pnpm 8.0.0+
- A Neon PostgreSQL database
- Clerk account for authentication
- Stripe account for payments

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

3. **Set up environment variables**
   Copy `.env.example` to `.env.local` and fill in your credentials:

   ```bash
   cp .env.example .env.local
   ```

4. **Run database migrations**

   ```bash
   pnpm run drizzle:migrate
   ```

5. **Start the development server**
   ```bash
   pnpm run dev
   ```

## Database Migration (Supabase → Drizzle + Neon)

This project has been migrated from Supabase to a modern stack using Clerk, Neon, and Drizzle ORM.

### Migration Overview

The migration involved:

- **Authentication**: Supabase Auth → Clerk
- **Database**: Supabase PostgreSQL → Neon PostgreSQL
- **ORM**: Supabase client → Drizzle ORM
- **Security**: Supabase RLS → Custom RLS with Clerk JWT integration

### Database Schema

The application uses the following core tables:

- `users` - User account information linked to Clerk
- `creator_profiles` - Artist/creator profile data
- `social_links` - Social media and music platform links
- `click_events` - Analytics and tracking data
- `tips` - Payment and tipping records

### Row Level Security (RLS)

All tables are protected with RLS policies that:

- Use Clerk JWT tokens for user identification
- Allow users to only access their own data
- Support public profile visibility settings
- Enable anonymous click tracking for analytics

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Neon Database
DATABASE_URL=postgresql://...

# Stripe Payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Optional: Analytics and monitoring
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

## Development

### Database Management

```bash
# Generate migrations from schema changes
pnpm run drizzle:generate

# Run migrations
pnpm run drizzle:migrate

# Open Drizzle Studio (database GUI)
pnpm run drizzle:studio

# Seed the database with test data
pnpm run db:seed
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run E2E tests
pnpm run test:e2e

# Run specific test suites
pnpm run test:unit
pnpm run test:integration
```

### Code Quality

```bash
# Type checking
pnpm run typecheck

# Linting
pnpm run lint
pnpm run lint:fix

# Code formatting
pnpm run format
pnpm run format:check
```

## Deployment

The application is deployed on Vercel with automatic previews for pull requests.

### Production Deployment

1. **Neon Database**: Create a production database in Neon
2. **Clerk**: Configure production environment in Clerk dashboard
3. **Stripe**: Set up production webhook endpoints
4. **Vercel**: Deploy with environment variables configured

### Database Migrations in Production

```bash
# Set production environment
export GIT_BRANCH=production
export ALLOW_PROD_MIGRATIONS=true

# Run production migrations
pnpm run drizzle:migrate:prod
```

## Rollback Procedures

In case of issues with the new stack:

### 1. Application Rollback

```bash
# Revert to previous stable commit
git revert HEAD~1

# Or rollback via Vercel dashboard
# Go to Vercel → Deployments → Promote previous deployment
```

### 2. Database Rollback

```bash
# Rollback specific migration
npx drizzle-kit drop --target=<previous_migration>

# Or restore from Neon backup
# Go to Neon dashboard → Backups → Restore to point-in-time
```

### 3. Feature Flag Rollback

```bash
# Disable feature flags if implemented
# Update environment variables to disable new features
NEXT_PUBLIC_ENABLE_NEW_AUTH=false
```

## Performance Monitoring

The application includes comprehensive monitoring:

### Metrics Tracked

- **Database**: Query performance, connection pool usage
- **Authentication**: Login success rates, token refresh rates
- **API**: Response times, error rates
- **Frontend**: Core Web Vitals, user interactions

### Monitoring Tools

- **Neon**: Database performance metrics
- **Clerk**: Authentication analytics
- **Vercel**: Edge function performance
- **PostHog**: User behavior analytics

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Follow the conventional commit format: `feat:`, `fix:`, `chore:`
4. Ensure all tests pass: `pnpm run check`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
# Force CI
