import { describe, expect, it } from 'vitest';

import {
  isMissingConnectorSchemaError,
  isMissingConnectorWorkflowTablesError,
} from './schema-errors';

describe('isMissingConnectorWorkflowTablesError', () => {
  it('returns true for Drizzle-wrapped missing suggested_actions relation', () => {
    const error = new Error(
      'Failed query: select "id", "user_id", "payload" from "suggested_actions" where "suggested_actions"."status" = $1 limit $2',
      {
        cause: {
          code: '42P01',
          message: 'relation "suggested_actions" does not exist',
        },
      }
    );

    expect(isMissingConnectorWorkflowTablesError(error)).toBe(true);
  });

  it('returns true for missing workflow_runs relation', () => {
    const error = new Error('relation "workflow_runs" does not exist', {
      cause: { code: '42P01' },
    });

    expect(isMissingConnectorWorkflowTablesError(error)).toBe(true);
  });

  it('returns false for unrelated missing relations', () => {
    const error = new Error('relation "user_entitlements" does not exist', {
      cause: { code: '42P01' },
    });

    expect(isMissingConnectorWorkflowTablesError(error)).toBe(false);
  });
});

describe('isMissingConnectorSchemaError', () => {
  it('returns true for missing connector_accounts relation', () => {
    const error = new Error(
      'Failed query: select "status" from "connector_accounts" where "connector_accounts"."user_id" = $1',
      {
        cause: {
          code: '42P01',
          message: 'relation "connector_accounts" does not exist',
        },
      }
    );

    expect(isMissingConnectorSchemaError(error)).toBe(true);
  });
});
