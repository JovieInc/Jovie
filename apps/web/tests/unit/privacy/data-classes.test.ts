import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  DATA_CLASSES,
  DATA_CLASSIFICATIONS,
  DELETION_MECHANISMS,
  EXPORT_CHANNELS,
  getRegisteredTables,
} from '@/lib/privacy/data-classes';

/**
 * Lifecycle metadata gate (JOV-6056).
 *
 * Any pg table whose columns hold personal data, credentials, or payment
 * identifiers must be registered in `lib/privacy/data-classes.ts` with
 * purpose, owner, retention, deletion, and export metadata before it can
 * land. Adding such a table without a registry entry fails this test.
 */

// Column names that indicate sensitive/customer data. Suffix-based so
// `contact_email`, `stripe_customer_id`, `invite_token_hash`, etc. all match.
const SENSITIVE_COLUMN =
  /(^|_)(email|phone|birthday|dob|ssn|address|fingerprint|ip_address|clerk_id|clerk_user_id|secret|token)(_[a-z]+)*$/;

const SENSITIVE_EXACT = new Set([
  'username',
  'username_normalized',
  'full_name',
  'person_name',
  'buyer_name',
  'tipper_name',
  'merchant_name',
  'investor_name',
  'primary_name',
  'device_id',
  'device_library_identifier',
  'push_token',
]);

// Sensitive-looking suffixes that are actually counters, labels, or method
// metadata rather than stored user data.
const BENIGN_COLUMNS = new Set([
  'token_usage',
  'token_cost',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'cached_tokens',
  'prompt_tokens',
  'completion_tokens',
  'access_token_ttl',
  'refresh_token_ttl',
  'token_endpoint_auth_method',
  'dpop_bound_access_tokens',
  'dpop_bound_access_tokens_required',
  'email_verified',
  'email_verified_at',
  'phone_number_verified',
  'phone_verified_at',
  'email_invalid',
  'email_suspicious',
  'email_invalid_reason',
  'email_type',
  'email_sequence_step',
  'last_email_sent_at',
]);

function sensitiveColumns(columnNames: string[]): string[] {
  return columnNames.filter(
    name =>
      !BENIGN_COLUMNS.has(name) &&
      (SENSITIVE_COLUMN.test(name) || SENSITIVE_EXACT.has(name))
  );
}

// Barrel imports of the schema index are restricted, so enumerate tables via
// an eager glob over the schema directory instead.
const schemaModules = import.meta.glob<Record<string, unknown>>(
  '../../../lib/db/schema/*.ts',
  { eager: true }
);

function allTables(): Array<{
  exportName: string;
  tableName: string;
  columns: string[];
}> {
  const tables: Array<{
    exportName: string;
    tableName: string;
    columns: string[];
  }> = [];
  for (const schemaModule of Object.values(schemaModules)) {
    for (const [exportName, value] of Object.entries(schemaModule)) {
      try {
        const config = getTableConfig(value as never);
        tables.push({
          exportName,
          tableName: config.name,
          columns: config.columns.map(c => c.name),
        });
      } catch {
        // Not a pgTable export.
      }
    }
  }
  return tables;
}

describe('data lifecycle registry', () => {
  it('flags every PII-bearing table as registered', () => {
    const registered = getRegisteredTables();
    const uncovered: string[] = [];
    for (const table of allTables()) {
      if (sensitiveColumns(table.columns).length === 0) continue;
      if (!registered.has(table.tableName)) {
        uncovered.push(
          `${table.tableName} (${table.exportName}): ${sensitiveColumns(table.columns).join(', ')}`
        );
      }
    }
    expect(
      uncovered,
      `PII-bearing tables missing lifecycle metadata — add them to lib/privacy/data-classes.ts:\n${uncovered.join('\n')}`
    ).toEqual([]);
  });

  it('only references tables that exist in the schema', () => {
    const existing = new Set(allTables().map(t => t.tableName));
    for (const dataClass of DATA_CLASSES) {
      for (const table of dataClass.tables) {
        expect(
          existing.has(table),
          `${dataClass.id} registers unknown table "${table}"`
        ).toBe(true);
      }
    }
  });

  it('requires complete lifecycle metadata on every entry', () => {
    for (const dataClass of DATA_CLASSES) {
      expect(dataClass.id).toMatch(/^[a-z0-9-]+$/);
      expect(dataClass.title.length).toBeGreaterThan(0);
      expect(dataClass.purpose.length).toBeGreaterThan(0);
      expect(dataClass.owner).toMatch(/^[a-z]+\/[a-z-]+$/);
      expect(DATA_CLASSIFICATIONS).toContain(dataClass.classification);
      expect(dataClass.tables.length).toBeGreaterThan(0);
      expect(dataClass.retention.length).toBeGreaterThan(0);
      expect(dataClass.deletion.length).toBeGreaterThan(0);
      expect(dataClass.export.length).toBeGreaterThan(0);
      for (const mechanism of dataClass.deletion) {
        expect(DELETION_MECHANISMS).toContain(mechanism);
      }
      for (const channel of dataClass.export) {
        expect(EXPORT_CHANNELS).toContain(channel);
      }
    }
  });

  it('assigns each table and class id exactly once', () => {
    const ids = DATA_CLASSES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    const tableToClass = new Map<string, string>();
    for (const dataClass of DATA_CLASSES) {
      for (const table of dataClass.tables) {
        expect(
          tableToClass.has(table),
          `"${table}" registered by both ${tableToClass.get(table)} and ${dataClass.id}`
        ).toBe(false);
        tableToClass.set(table, dataClass.id);
      }
    }
  });

  it('keeps deletion semantics honest for account-delete tables', () => {
    // Tables the account-delete route explicitly writes: users (anonymized),
    // creator_profiles, pre_save_tokens, feedback_items, email_suppressions.
    const accountDeleteTables = [
      'users',
      'creator_profiles',
      'pre_save_tokens',
      'feedback_items',
      'email_suppressions',
    ];
    for (const table of accountDeleteTables) {
      const owner = DATA_CLASSES.find(c => c.tables.includes(table));
      expect(owner, `${table} must be registered`).toBeDefined();
      expect(
        owner!.deletion,
        `${table} must declare account-delete-route deletion`
      ).toContain('account-delete-route');
    }
  });
});
