# Artist Image Maintenance

This document explains how to ensure all seed artists have valid Spotify images in the database.

## Overview

The Jovie application uses seed artists with Spotify profile images. These images need to be kept up-to-date and valid to ensure a good user experience.

## Seed Artists

The following artists are seeded in the database:

- 🌱 Lady Gaga (`ladygaga`)
- 🌱 David Guetta (`davidguetta`)
- 🌱 Billie Eilish (`billieeilish`)
- 🌱 Marshmello (`marshmello`)
- 🌱 Rihanna (`rihanna`)
- 🌱 Calvin Harris (`calvinharris`)
- 🌱 Sabrina Carpenter (`sabrinacarpenter`)
- 🌱 The Chainsmokers (`thechainsmokers`)
- 🌱 Dua Lipa (`dualipa`)
- 🌱 Tim White (`tim`) - Verified artist

## Available Scripts

### 1. Verify Artist Images

Check the current status of all artist images without making changes:

```bash
pnpm run verify-artist-images
```

This script will:

- Show all published artists
- Verify if they have valid Spotify image URLs
- Check if Spotify IDs are present
- Display verification status

### 2. Update Artist Images

Force update all artist images from Spotify (regardless of current status):

```bash
pnpm run update-artist-images
```

This script will:

- Fetch fresh data from Spotify API
- Update all artist images and taglines
- Get latest release information
- Update the database with new information

### 3. Ensure Valid Artist Images (Recommended)

Intelligently check and update only invalid or missing images:

```bash
pnpm run ensure-valid-artist-images
```

This script will:

- Check if current images are valid and accessible
- Only update images that are missing or invalid
- Provide a summary of verified vs updated images
- Be more efficient than the full update script

## When to Run

### Regular Maintenance

Run the ensure script weekly or monthly:

```bash
pnpm run ensure-valid-artist-images
```

### Before Deployments

Run the verify script to check image status:

```bash
pnpm run verify-artist-images
```

### After Adding New Artists

Run the update script to fetch fresh images:

```bash
pnpm run update-artist-images
```

## Requirements

The scripts require the following environment variables in `.env.local`:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

## Image Validation

Valid Spotify images must:

- Start with `https://i.scdn.co/image/`
- Be accessible (return 200 status code)
- Be from the official Spotify CDN

## Troubleshooting

### Missing Spotify Credentials

If you get "Missing Spotify credentials" error:

1. Check your `.env.local` file
2. Ensure `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set
3. Verify your Spotify API credentials are valid

### Rate Limiting

If you encounter rate limiting:

- The scripts include delays between requests
- Wait a few minutes and try again
- Consider running during off-peak hours

### Invalid Images

If images are showing as invalid:

1. Run the ensure script to update them
2. Check if the Spotify artist ID is correct
3. Verify the artist still exists on Spotify

## Database Schema

Artist images are stored in the `artists` table:

```sql
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT UNIQUE NOT NULL,
  spotify_id TEXT,
  name TEXT NOT NULL,
  image_url TEXT,
  tagline TEXT,
  published BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Automation

Consider setting up a GitHub Action to run the ensure script periodically:

```yaml
name: Maintain Artist Images
on:
  schedule:
    - cron: '0 2 * * 1' # Every Monday at 2 AM
  workflow_dispatch: # Manual trigger

jobs:
  maintain-images:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: pnpm install --frozen-lockfile
      - run: pnpm run ensure-valid-artist-images
        env:
          SPOTIFY_CLIENT_ID: ${{ secrets.SPOTIFY_CLIENT_ID }}
          SPOTIFY_CLIENT_SECRET: ${{ secrets.SPOTIFY_CLIENT_SECRET }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

This ensures artist images stay fresh and valid automatically.
