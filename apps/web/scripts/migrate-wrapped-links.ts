#!/usr/bin/env tsx

/**
 * One-time migration: Re-encrypt wrapped link URLs from base64 to AES-256-GCM.
 *
 * Reads all rows from wrapped_links, detects legacy base64-encoded URLs
 * (no `v` version field), decrypts them, re-encrypts with AES-GCM using
 * a versioned envelope, and updates the row.
 *
 * Idempotent — safe to re-run. Rows that already have `v: 1` are skipped.
 *
 * Usage: doppler run -- pnpm tsx apps/web/scripts/migrate-wrapped-links.ts
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { wrappedLinks } from '@/lib/db/schema/links';
import { simpleDecryptUrl } from '@/lib/utils/url-encryption';
import {
  encryptUrlRawKey,
  type RawKeyEncryptionResult,
} from '@/lib/utils/url-encryption.server';

async function main() {
  console.log('[migrate-wrapped-links] Starting migration...');

  const allLinks = await db
    .select({ id: wrappedLinks.id, encryptedUrl: wrappedLinks.encryptedUrl })
    .from(wrappedLinks);

  console.log(`[migrate-wrapped-links] Found ${allLinks.length} total rows.`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const link of allLinks) {
    try {
      // Check if already migrated (versioned AES-GCM envelope)
      let parsed: RawKeyEncryptionResult | null = null;
      try {
        parsed = JSON.parse(link.encryptedUrl) as RawKeyEncryptionResult;
      } catch {
        // Not JSON — legacy base64
      }

      if (parsed && parsed.v === 1 && parsed.iv && parsed.authTag) {
        skipped++;
        continue;
      }

      // Decrypt from legacy base64
      const originalUrl = simpleDecryptUrl(link.encryptedUrl);

      // Re-encrypt with AES-256-GCM
      const newEncrypted = JSON.stringify(encryptUrlRawKey(originalUrl));

      // Update the row (individual statement — no transactions for Neon HTTP)
      await db
        .update(wrappedLinks)
        .set({ encryptedUrl: newEncrypted })
        .where(eq(wrappedLinks.id, link.id));

      migrated++;
    } catch (error) {
      failed++;
      console.error(
        `[migrate-wrapped-links] Failed to migrate link ${link.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(
    `[migrate-wrapped-links] Done. Migrated: ${migrated}, Skipped: ${skipped}, Failed: ${failed}`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[migrate-wrapped-links] Fatal error:', err);
  process.exit(1);
});
