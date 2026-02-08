#!/usr/bin/env npx tsx
/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */
/**
 * Database Schema Validation Script
 *
 * This script validates that the Drizzle schema matches the actual database tables.
 * Run this as part of CI or before deployments to catch schema drift early.
 *
 * Usage:
 *   pnpm run db:validate
 *   npx tsx scripts/validate-db-schema.ts
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

// Configure WebSocket for Node.js
neonConfig.webSocketConstructor = ws;

// Tables defined in the Drizzle schema (lib/db/schema.ts)
const EXPECTED_TABLES = [
  'users',
  'user_settings',
  'creator_profiles',
  'social_links',
  'social_accounts',
  'audience_members',
  'click_events',
  'notification_subscriptions',
  'creator_contacts',
  'tips',
  'stripe_webhook_events',
  'signed_link_access',
  'wrapped_links',
  'profile_photos',
  'ingestion_jobs',
  'scraper_configs',
  'waitlist_entries',
] as const;

// Tables that are deprecated/legacy and can be ignored
// Note: artist_contacts was removed in migration 0031 (replaced by creator_contacts)
const LEGACY_TABLES: readonly string[] = [] as const;

interface ValidationResult {
  valid: boolean;
  missingTables: string[];
  extraTables: string[];
  warnings: string[];
}

async function validateSchema(): Promise<ValidationResult> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // Get all tables in the public schema
    const result = await db.execute<{ table_name: string }>(drizzleSql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const actualTables = new Set(
      (result.rows as { table_name: string }[]).map(r => r.table_name)
    );
    const expectedTables = new Set(EXPECTED_TABLES);
    const legacyTables = new Set(LEGACY_TABLES);

    const missingTables: string[] = [];
    const extraTables: string[] = [];
    const warnings: string[] = [];

    // Check for missing tables
    for (const table of expectedTables) {
      if (!actualTables.has(table)) {
        missingTables.push(table);
      }
    }

    // Check for extra tables (not in schema)
    for (const table of actualTables) {
      if (!expectedTables.has(table as (typeof EXPECTED_TABLES)[number])) {
        if (legacyTables.has(table as (typeof LEGACY_TABLES)[number])) {
          warnings.push(`Legacy table '${table}' exists - consider removing`);
        } else {
          extraTables.push(table);
        }
      }
    }

    return {
      valid: missingTables.length === 0,
      missingTables,
      extraTables,
      warnings,
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('🔍 Validating database schema...\n');

  const result = await validateSchema();

  if (result.missingTables.length > 0) {
    console.error('❌ Missing tables (defined in schema but not in database):');
    for (const table of result.missingTables) {
      console.error(`   - ${table}`);
    }
    console.error('');
  }

  if (result.extraTables.length > 0) {
    console.warn('⚠️  Extra tables (in database but not in schema):');
    for (const table of result.extraTables) {
      console.warn(`   - ${table}`);
    }
    console.warn('');
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    for (const warning of result.warnings) {
      console.warn(`   - ${warning}`);
    }
    console.warn('');
  }

  if (result.valid && result.extraTables.length === 0) {
    console.log('✅ Database schema is valid and matches Drizzle schema\n');
  } else if (result.valid) {
    console.log('✅ All required tables exist\n');
  } else {
    console.error('❌ Schema validation failed\n');
    console.error(
      'Run migrations to create missing tables: pnpm run drizzle:migrate\n'
    );
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
