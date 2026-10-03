import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH =
  'drizzle/migrations/0133_reconcile_feature_flag_overrides.sql';

const OVERRIDE_KEYS_TO_REMOVE = [
  'code:DESIGN_V1',
  'code:INBOX_HOME',
  'code:PROFILES_WORKSPACE',
  'code:PROFILE_SEARCH_MONITORING',
  'code:BILLING_UPGRADE_DIRECT',
  'code:PLAYLIST_ENGINE',
  'code:MERCH_MVP',
  'code:APPLE_WALLET_PROFILE_PASS',
  'code:TELEPROMPTER_RECORDING',
  'code:RELEASE_TO_REVENUE_AUTOPILOT',
  'code:AI_CONNECTORS_BETA',
] as const;

describe('feature flag override reconciliation migration', () => {
  const sql = readFileSync(join(process.cwd(), MIGRATION_PATH), 'utf8');

  it('removes stale and default-equivalent override rows', () => {
    expect(sql).toContain('DELETE FROM "feature_flag_overrides"');
    for (const overrideKey of OVERRIDE_KEYS_TO_REMOVE) {
      expect(sql).toContain(`'${overrideKey}'`);
    }
  });

  it('preserves the append-only feature flag audit log', () => {
    expect(sql).not.toContain('DELETE FROM "feature_flag_audit_events"');
  });
});
