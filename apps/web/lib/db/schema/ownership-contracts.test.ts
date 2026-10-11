import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig, PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  creatorCaptureHandoffs,
  creatorDocumentRevisions,
  creatorDocuments,
  creatorRevisionApprovals,
  creatorRevisionClaims,
} from './creator-documents';
import {
  financeAccounts,
  financeBudgetSettings,
  financeBudgetTargets,
  financeClassificationRules,
  financeExports,
  financeInstitutions,
  financeTransactionClassifications,
  financeTransactionSplits,
  financeTransactions,
} from './finance';
import {
  artistRuleEvents,
  artistRuleExceptions,
  artistRules,
  creatorBrands,
  creatorOffers,
  libraryRelationships,
  optimizationExperiments,
} from './library-content-graph';

// These assertions inspect the real Drizzle constraints used to generate SQL.
// They protect ownership/lifecycle contracts; actual RLS enforcement is covered
// separately by integration/rls-access-control.test.ts against Postgres.
function foreignKeys(table: PgTable) {
  return getTableConfig(table).foreignKeys.map(key => {
    const ref = key.reference();
    return {
      columns: ref.columns.map(column => column.name),
      target: getTableName(ref.foreignTable),
      targetColumns: ref.foreignColumns.map(column => column.name),
      onDelete: key.onDelete,
    };
  });
}

function expectReference(
  table: PgTable,
  column: string,
  target: string,
  onDelete: string
) {
  expect(foreignKeys(table)).toContainEqual({
    columns: [column],
    target,
    targetColumns: ['id'],
    onDelete,
  });
}

function expectUnique(table: PgTable, name: string, columns: string[]) {
  const index = getTableConfig(table).indexes.find(
    candidate => candidate.config.name === name
  );
  expect(index?.config.unique).toBe(true);
  expect(
    index?.config.columns.map(column =>
      'name' in column ? column.name : 'expression'
    )
  ).toEqual(columns);
  return index;
}

const FINANCE_TABLES = [
  financeInstitutions,
  financeAccounts,
  financeTransactions,
  financeExports,
  financeBudgetTargets,
  financeBudgetSettings,
  financeClassificationRules,
  financeTransactionClassifications,
  financeTransactionSplits,
];
const GRAPH_TABLES = [
  artistRules,
  artistRuleEvents,
  artistRuleExceptions,
  creatorBrands,
  creatorOffers,
  libraryRelationships,
  optimizationExperiments,
];

describe('owner-bound schema relationships', () => {
  it.each(FINANCE_TABLES.map(table => [getTableName(table), table] as const))(
    '%s requires a real user owner and deletes their financial data with them',
    (_name, table) => {
      const owner = getTableColumns(table).ownerUserId;
      expect(owner.notNull).toBe(true);
      expectReference(table, 'owner_user_id', 'users', 'cascade');
    }
  );

  it('keeps financial children attached while preserving classifications after a source rule is deleted', () => {
    expectReference(
      financeAccounts,
      'institution_id',
      'finance_institutions',
      'cascade'
    );
    expectReference(
      financeTransactions,
      'account_id',
      'finance_accounts',
      'cascade'
    );
    expectReference(
      financeClassificationRules,
      'match_account_id',
      'finance_accounts',
      'cascade'
    );
    expectReference(
      financeClassificationRules,
      'source_transaction_id',
      'finance_transactions',
      'set null'
    );
    expectReference(
      financeTransactionClassifications,
      'transaction_id',
      'finance_transactions',
      'cascade'
    );
    expectReference(
      financeTransactionClassifications,
      'rule_id',
      'finance_classification_rules',
      'set null'
    );
    expectReference(
      financeTransactionSplits,
      'transaction_id',
      'finance_transactions',
      'cascade'
    );
    expect(financeTransactionClassifications.ruleId.notNull).toBe(false);
  });

  it('scopes budget uniqueness to owner/category/month and classification replay to one transaction', () => {
    expectUnique(
      financeBudgetTargets,
      'finance_budget_targets_owner_category_month_idx',
      ['owner_user_id', 'category', 'month']
    );
    expectUnique(
      financeTransactionClassifications,
      'finance_transaction_classifications_tx_idx',
      ['transaction_id']
    );
    expect(financeBudgetSettings.ownerUserId.primary).toBe(true);
  });

  it.each(GRAPH_TABLES.map(table => [getTableName(table), table] as const))(
    '%s requires an owning creator profile and follows profile deletion',
    (_name, table) => {
      expect(getTableColumns(table).creatorProfileId.notNull).toBe(true);
      expectReference(
        table,
        'creator_profile_id',
        'creator_profiles',
        'cascade'
      );
    }
  );

  it('retains rule history but prevents erasing the authorizing identity of an exception', () => {
    expectReference(artistRules, 'confirmed_by', 'users', 'set null');
    expectReference(
      artistRules,
      'supersedes_rule_id',
      'artist_rules',
      'set null'
    );
    expectReference(artistRuleEvents, 'rule_id', 'artist_rules', 'cascade');
    expectReference(artistRuleEvents, 'actor_user_id', 'users', 'set null');
    expectReference(artistRuleExceptions, 'rule_id', 'artist_rules', 'cascade');
    expectReference(artistRuleExceptions, 'authorized_by', 'users', 'restrict');
    expect(artistRuleExceptions.authorizedBy.notNull).toBe(true);
    expectReference(libraryRelationships, 'reviewed_by', 'users', 'set null');
    expectReference(optimizationExperiments, 'decided_by', 'users', 'set null');
  });

  it('keeps offers when optional brands or source links disappear and namespaces graph identities per creator', () => {
    expectReference(creatorOffers, 'brand_id', 'creator_brands', 'set null');
    expectReference(
      creatorOffers,
      'source_link_id',
      'audience_source_links',
      'set null'
    );
    expectUnique(creatorBrands, 'creator_brands_profile_name_unique', [
      'creator_profile_id',
      'normalized_name',
    ]);
    expectUnique(
      libraryRelationships,
      'library_relationships_identity_unique',
      [
        'creator_profile_id',
        'kind',
        'subject_type',
        'subject_id',
        'object_type',
        'object_id',
      ]
    );
    expect(artistRules.status.default).toBe('suggested');
    expect(artistRules.allowOverride.default).toBe(false);
    expect(libraryRelationships.status.default).toBe('suggested');
    expect(optimizationExperiments.status.default).toBe('draft');
  });
});

describe('creator revision approval and evidence constraints', () => {
  it('requires the exact approved revision and restricts deleting referenced approval evidence', () => {
    expectReference(
      creatorDocuments,
      'creator_profile_id',
      'creator_profiles',
      'cascade'
    );
    expectReference(
      creatorDocumentRevisions,
      'document_id',
      'creator_documents',
      'cascade'
    );
    expectReference(
      creatorRevisionClaims,
      'revision_id',
      'creator_document_revisions',
      'cascade'
    );
    expectReference(
      creatorRevisionClaims,
      'source_record_id',
      'memory_source_records',
      'restrict'
    );
    expectReference(
      creatorRevisionApprovals,
      'document_id',
      'creator_documents',
      'cascade'
    );
    expectReference(
      creatorRevisionApprovals,
      'revision_id',
      'creator_document_revisions',
      'restrict'
    );
    expectReference(
      creatorCaptureHandoffs,
      'creator_profile_id',
      'creator_profiles',
      'cascade'
    );
    expectReference(
      creatorCaptureHandoffs,
      'document_id',
      'creator_documents',
      'cascade'
    );
    expectReference(
      creatorCaptureHandoffs,
      'revision_id',
      'creator_document_revisions',
      'restrict'
    );
    expectReference(
      creatorCaptureHandoffs,
      'approval_id',
      'creator_revision_approvals',
      'restrict'
    );
    expect(creatorCaptureHandoffs.approvalId.notNull).toBe(true);
    expect(creatorDocuments.stage.default).toBe('private_draft');
    expect(creatorRevisionClaims.evidenceState.default).toBe('unresolved');
  });

  it('prevents duplicate revisions, claims and handoffs without making idempotency global across creators', () => {
    const capture = expectUnique(
      creatorDocuments,
      'creator_documents_capture_idempotency_unique',
      ['creator_profile_id', 'capture_idempotency_key']
    );
    const dialect = new PgDialect();
    expect(capture?.config.where).toBeDefined();
    expect(dialect.sqlToQuery(capture!.config.where!).sql).toBe(
      'capture_idempotency_key IS NOT NULL'
    );
    expectUnique(
      creatorDocumentRevisions,
      'creator_document_revisions_document_revision_unique',
      ['document_id', 'revision']
    );
    expectUnique(
      creatorRevisionClaims,
      'creator_revision_claims_revision_idempotency_unique',
      ['revision_id', 'idempotency_key']
    );
    expectUnique(
      creatorRevisionApprovals,
      'creator_revision_approvals_exact_revision_unique',
      ['document_id', 'revision_id']
    );
    expectUnique(
      creatorCaptureHandoffs,
      'creator_capture_handoffs_approval_unique',
      ['approval_id']
    );
  });

  it('generates positive revision checks and forbids supported claims without a source record', () => {
    const dialect = new PgDialect();
    const checks = (table: PgTable) =>
      getTableConfig(table).checks.map(
        check => dialect.sqlToQuery(check.value).sql
      );
    expect(checks(creatorDocuments)).toEqual([
      '"creator_documents"."current_revision" > 0',
    ]);
    expect(checks(creatorDocumentRevisions)).toEqual([
      '"creator_document_revisions"."revision" > 0 AND "creator_document_revisions"."schema_version" > 0',
    ]);
    expect(checks(creatorRevisionClaims)).toEqual([
      '"creator_revision_claims"."evidence_state" <> \'supported\' OR "creator_revision_claims"."source_record_id" IS NOT NULL',
    ]);
  });
});
