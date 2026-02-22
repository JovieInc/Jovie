import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';

const VERIFICATION_COLUMNS = [
  'verification_status',
  'verification_token',
  'verification_checked_at',
  'verified_at',
] as const;

type ColumnNameRow = { column_name: string };

const VERIFICATION_COLUMNS_CACHE_TTL_MS = 60_000;

let cachedVerificationColumns: {
  available: boolean;
  timestamp: number;
} | null = null;

export async function getSocialLinksVerificationColumnSupport(
  dbOrTx: DbOrTransaction
): Promise<boolean> {
  const now = Date.now();
  if (
    cachedVerificationColumns &&
    now - cachedVerificationColumns.timestamp <
      VERIFICATION_COLUMNS_CACHE_TTL_MS
  ) {
    return cachedVerificationColumns.available;
  }

  try {
    const result = await dbOrTx.execute(drizzleSql<ColumnNameRow>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'social_links'
        AND column_name IN (
          'verification_status',
          'verification_token',
          'verification_checked_at',
          'verified_at'
        )
    `);

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const columnNames = new Set(
      rows
        .map(row => row?.column_name)
        .filter((column): column is string => typeof column === 'string')
    );

    const available = VERIFICATION_COLUMNS.every(column =>
      columnNames.has(column)
    );

    cachedVerificationColumns = { available, timestamp: now };
    return available;
  } catch {
    cachedVerificationColumns = { available: false, timestamp: now };
    return false;
  }
}

export function buildSocialLinksVerificationSelect(includeColumns: boolean) {
  return {
    verificationStatus: includeColumns
      ? socialLinks.verificationStatus
      : drizzleSql<string | null>`NULL`,
    verificationToken: includeColumns
      ? socialLinks.verificationToken
      : drizzleSql<string | null>`NULL`,
    verifiedAt: includeColumns
      ? socialLinks.verifiedAt
      : drizzleSql<Date | null>`NULL`,
  };
}
