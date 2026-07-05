import { getDeepErrorMessage, unwrapPgError } from '@/lib/db/errors';

/** Connector v1 tables introduced in migration 0048 (JOV-2229). */
export const CONNECTOR_SCHEMA_TABLES = [
  'connector_accounts',
  'context_facts',
  'external_objects',
  'suggested_actions',
  'workflow_runs',
] as const;

function mentionsConnectorSchemaTable(message: string): boolean {
  const normalized = message.toLowerCase();

  return CONNECTOR_SCHEMA_TABLES.some(table => {
    const quoted = `"${table}"`;
    return (
      normalized.includes(`relation ${quoted}`) ||
      normalized.includes(`relation ${table}`) ||
      normalized.includes(`from ${quoted}`) ||
      normalized.includes(`from ${table}`)
    );
  });
}

/**
 * True when Postgres reports a connector v1 table is missing (pre-migration).
 * Drizzle surfaces these as "Failed query: select ... from suggested_actions".
 */
export function isMissingConnectorSchemaError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (
    !message.includes('does not exist') &&
    unwrapPgError(error).code !== '42P01'
  ) {
    return false;
  }

  return mentionsConnectorSchemaTable(message);
}

/**
 * True when Postgres reports the `suggested_actions.signal_type` column is
 * missing (code shipped ahead of the prod migration — the known
 * migration-drift class). Callers degrade by re-querying without the column.
 */
export function isMissingSignalTypeColumnError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (
    !message.includes('does not exist') &&
    unwrapPgError(error).code !== '42703'
  ) {
    return false;
  }

  return message.includes('signal_type');
}

export function isMissingConnectorWorkflowTablesError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (
    !message.includes('does not exist') &&
    unwrapPgError(error).code !== '42P01'
  ) {
    return false;
  }

  return (
    message.includes('suggested_actions') || message.includes('workflow_runs')
  );
}
