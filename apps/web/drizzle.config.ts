import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || '';

// Clean the URL for Neon (remove the +neon part) — Drizzle Kit expects a standard Postgres URL
const url = databaseUrl.replace(/^postgres(ql)?\+neon:\/\//, 'postgres$1://');

export default defineConfig({
  schema: [
    './lib/db/schema/activation-pilot.ts',
    './lib/db/schema/index.ts',
    './lib/db/schema/pmf-survey.ts',
    './lib/db/schema/signup-replays.ts',
    './lib/db/schema/track-daily-snapshots.ts',
  ],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
