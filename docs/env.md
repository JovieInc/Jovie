# Environment Variables

This document describes the environment variables used in the Jovie application.

## Guardrail: keep real secrets out of git

- **Never commit real credentials** to `.env.local` or any `env-backup/.env.*` files.
- Use `.env.example` as a **redacted template** and share live values via Vercel, 1Password, or your team’s secret manager.
- If you need to onboard locally, copy `.env.example` to `.env.local` and replace placeholders on your machine only.

## Database Configuration

### `DATABASE_URL`

Connection string for the PostgreSQL database. This can be either a standard PostgreSQL connection string or a Neon serverless connection string.

- **Format for standard PostgreSQL**: `postgresql://username:password@hostname:port/database`
- **Format for Neon serverless**: `postgresql+neon://username:password@hostname/database`

During the transition phase, this will point to the existing Supabase PostgreSQL database. In the future, it will be updated to point to Neon.

**Example:**

```
# For Supabase
DATABASE_URL=postgresql://postgres:password@db.project-id.supabase.co:5432/postgres

# For Neon (future)
DATABASE_URL=postgresql+neon://user:password@ep-cool-name-12345.us-east-1.aws.neon.tech/neondb
```

## Supabase Configuration

### `NEXT_PUBLIC_SUPABASE_URL`

The URL of your Supabase project.

**Example:** `https://your-project-id.supabase.co`

### `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The public/anon key for your Supabase project. This is used for client-side access.

## Clerk Authentication

### `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

The publishable key for Clerk authentication.

### `CLERK_SECRET_KEY`

The secret key for Clerk authentication.

## Application Configuration

### `NEXT_PUBLIC_APP_URL`

The public URL of your application.

**Default:** `https://jov.ie`

## Analytics & Feature Flags (Statsig)

### `NEXT_PUBLIC_STATSIG_CLIENT_KEY`

Public Statsig client SDK key. Analytics and feature gates remain disabled when this is missing.

## Stripe Billing

### `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

The publishable key for Stripe.

### `STRIPE_SECRET_KEY`

The secret key for Stripe.

### `STRIPE_WEBHOOK_SECRET`

The webhook secret for Stripe.

### `STRIPE_PRICE_PRO_MONTHLY`

The price ID for the Pro monthly subscription ($39/mo).

### `STRIPE_PRICE_PRO_YEARLY`

The price ID for the Pro yearly subscription ($348/yr).

## Cloudinary Configuration

### `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`

The cloud name for Cloudinary.

### `CLOUDINARY_API_KEY`

The API key for Cloudinary.

### `CLOUDINARY_API_SECRET`

The API secret for Cloudinary.

### `CLOUDINARY_UPLOAD_FOLDER`

The folder to upload files to in Cloudinary.

### `CLOUDINARY_UPLOAD_PRESET`

The upload preset for Cloudinary.

## Spotify Integration

### `SPOTIFY_CLIENT_ID`

The client ID for Spotify API.

### `SPOTIFY_CLIENT_SECRET`

The client secret for Spotify API.

## Feature Flags

### `NEXT_PUBLIC_FEATURE_TIPS`

Enable or disable the tips feature.

**Example:** `true`
