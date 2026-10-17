import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { DISTRIBUTOR_MANIFESTS } from './distributor-manifests';
import {
  type DistributorColumnMapping,
  type DistributorReportContext,
  type DistributorReportReceipt,
  distributorColumnMappingSchema,
  distributorReportContextSchema,
  distributorReportReceiptSchema,
  manualSummaryValueSchema,
} from './distributor-report-contract';
import {
  type RoyaltyMoney,
  type RoyaltySource,
  type RoyaltyStatementLine,
  royaltyMoneySchema,
  royaltySourceSchema,
  royaltyStatementLineSchema,
} from './royalty-contract';

export const MAX_DISTRIBUTOR_REPORT_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 50_000;
const tableSchema = z.strictObject({
  columns: z.array(z.string().min(1).max(256)).min(1).max(128),
  rows: z
    .array(z.array(z.string().max(16384)).min(1).max(128))
    .min(1)
    .max(MAX_ROWS),
});

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** actorUserId comes from server auth, never the submitted report. */
export function readOwnerColumnMapping(
  actorUserId: string,
  input: unknown
): DistributorColumnMapping {
  const mapping = distributorColumnMappingSchema.parse(input);
  if (mapping.ownerUserId !== actorUserId)
    throw new Error('Mapping owner mismatch');
  return mapping;
}

/** Validate before an immutable insert; supply the saved history for this owner. */
export function registerOwnerColumnMapping(
  actorUserId: string,
  input: unknown,
  savedVersions: readonly unknown[]
): DistributorColumnMapping {
  const mapping = readOwnerColumnMapping(actorUserId, input);
  const history = savedVersions
    .map(value => readOwnerColumnMapping(actorUserId, value))
    .filter(value => value.id === mapping.id);
  if (
    history.some(
      value =>
        value.accountId !== mapping.accountId ||
        value.distributorId !== mapping.distributorId
    )
  ) {
    throw new Error('Mapping identity cannot change provider or account');
  }
  const existing = history.find(value => value.version === mapping.version);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(mapping)) {
      throw new Error('Saved mapping versions are immutable');
    }
    return existing;
  }
  if (
    mapping.version !==
    Math.max(0, ...history.map(value => value.version)) + 1
  ) {
    throw new Error('Mapping versions must increase sequentially');
  }
  return mapping;
}

function authorizeSource(
  actorUserId: string,
  input: unknown,
  bytes: Uint8Array
): RoyaltySource {
  const source = royaltySourceSchema.parse(input);
  if (
    source.approval.approvedByUserId !== actorUserId ||
    DISTRIBUTOR_MANIFESTS[source.distributorId].approval.status !== 'approved'
  )
    throw new Error('Source owner or provider approval mismatch');
  if (bytes.length === 0 || bytes.length > MAX_DISTRIBUTOR_REPORT_BYTES) {
    throw new Error('Source size outside import limits');
  }
  if (sha256(bytes) !== source.fileSha256)
    throw new Error('Source digest mismatch');
  return source;
}

function readTable(bytes: Uint8Array, format: RoyaltySource['format']) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let input: unknown;
  if (format === 'json') {
    input = JSON.parse(text);
  } else if (format === 'csv' || format === 'tsv') {
    const records: unknown = parse(text, {
      bom: true,
      delimiter: format === 'tsv' ? '\t' : ',',
      max_record_size: 128 * 16384,
      skip_empty_lines: true,
      // Read one excess row to reject truncation rather than accept a prefix.
      to: MAX_ROWS + 2,
    });
    const rows = z.array(z.array(z.string())).parse(records);
    input = { columns: rows[0], rows: rows.slice(1) };
  } else {
    throw new Error('Explicit mappings require CSV, TSV, or structured JSON');
  }
  const table = tableSchema.parse(input);
  if (table.rows.some(row => row.length !== table.columns.length)) {
    throw new Error('Report row width does not match headers');
  }
  return table;
}

// Integer coefficients retain all supplied decimal precision, including negatives.
function totalMoney(values: RoyaltyMoney[]): RoyaltyMoney[] {
  const totals = new Map<string, { units: bigint; scale: number }>();
  for (const { amount, originalCurrency } of values) {
    const [whole, fraction = ''] = amount.split('.');
    const next = {
      units: BigInt(`${whole}${fraction}`),
      scale: fraction.length,
    };
    const prior = totals.get(originalCurrency) ?? { units: 0n, scale: 0 };
    const scale = Math.max(prior.scale, next.scale);
    totals.set(originalCurrency, {
      units:
        prior.units * 10n ** BigInt(scale - prior.scale) +
        next.units * 10n ** BigInt(scale - next.scale),
      scale,
    });
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([originalCurrency, { units, scale }]) => {
      const digits = (units < 0n ? -units : units)
        .toString()
        .padStart(scale + 1, '0');
      const amount = `${units < 0n ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
      return royaltyMoneySchema.parse({ amount, originalCurrency });
    });
}

/** Fail closed on incomparable periods. Reconciliation owns explicit replacements. */
export function assertNoDistributorReportOverlap(
  actorUserId: string,
  incomingInput: unknown,
  existingInputs: readonly unknown[]
): void {
  const incoming = distributorReportReceiptSchema.parse(incomingInput);
  const existing = existingInputs.map(input =>
    distributorReportReceiptSchema.parse(input)
  );
  if (
    [incoming, ...existing].some(report => report.ownerUserId !== actorUserId)
  ) {
    throw new Error('Report owner mismatch');
  }
  const next = incoming.statement.header;
  for (const prior of existing) {
    const previous = prior.statement.header;
    if (
      previous.source.distributorId !== next.source.distributorId ||
      previous.source.accountId !== next.source.accountId
    )
      continue;
    if (
      previous.source.fileSha256 === next.source.fileSha256 ||
      previous.statementId === next.statementId
    ) {
      throw new Error('Duplicate statement evidence requires reconciliation');
    }
    if (
      previous.granularity !== 'statement_summary' &&
      next.granularity !== 'statement_summary'
    )
      continue;
    // Activity is strongest; reporting is a fallback only when activity is absent.
    const axis =
      previous.periods.activity && next.periods.activity
        ? 'activity'
        : 'reporting';
    const a = previous.periods[axis];
    const b = next.periods[axis];
    if (!a || !b || (a.start <= b.end && b.start <= a.end)) {
      throw new Error('Overlapping summary evidence requires reconciliation');
    }
  }
}

interface ReportInput {
  readonly actorUserId: string;
  readonly source: unknown;
  readonly bytes: Uint8Array;
  readonly context: unknown;
  /** Complete active account evidence from an owner-scoped repository query. */
  readonly existingReports: readonly unknown[];
}

function receipt(
  input: ReportInput,
  context: DistributorReportContext,
  value: Pick<
    DistributorReportReceipt,
    'entryMode' | 'mapping' | 'mappingSha256' | 'manualValues' | 'statement'
  >
): DistributorReportReceipt {
  const result = distributorReportReceiptSchema.parse({
    contractVersion: 'jovie.distributor-report/v1',
    ownerUserId: input.actorUserId,
    originalEvidenceRef: context.originalEvidenceRef,
    monetaryBasis: context.monetaryBasis,
    monetaryBasisLocator: context.monetaryBasisLocator,
    currencyLocator: context.currencyLocator,
    statementCurrency: context.statementCurrency,
    ...value,
  });
  assertNoDistributorReportOverlap(
    input.actorUserId,
    result,
    input.existingReports
  );
  return result;
}

/** Explicit layout only; this never recognizes or advertises a vendor layout. */
export function importMappedDistributorReport(
  input: ReportInput & { readonly mapping: unknown }
): DistributorReportReceipt {
  const mapping = readOwnerColumnMapping(input.actorUserId, input.mapping);
  const source = authorizeSource(input.actorUserId, input.source, input.bytes);
  const context = distributorReportContextSchema.parse(input.context);
  const table = readTable(input.bytes, source.format);
  if (
    mapping.distributorId !== source.distributorId ||
    mapping.accountId !== source.accountId ||
    mapping.monetaryBasis !== context.monetaryBasis ||
    JSON.stringify(mapping.sourceFormatVersion) !==
      JSON.stringify(source.formatVersion) ||
    JSON.stringify(mapping.columns) !== JSON.stringify(table.columns)
  )
    throw new Error(
      'Mapping scope, version, basis, or layout changed; create a new mapping version'
    );
  if (mapping.currency.mode === 'statement' && !context.statementCurrency) {
    throw new Error('Declared statement currency evidence is required');
  }
  const lines: RoyaltyStatementLine[] = [];
  const values: RoyaltyMoney[] = [];
  for (const [index, row] of table.rows.entries()) {
    const cell = (name: string) => row[table.columns.indexOf(name)];
    const field = (name: keyof DistributorColumnMapping['fields']) => {
      const nameInSource = mapping.fields[name];
      return nameInSource ? cell(nameInSource) || null : null;
    };
    const originalCurrency =
      mapping.currency.mode === 'column'
        ? cell(mapping.currency.column)
        : context.statementCurrency?.originalCurrency;
    const money = royaltyMoneySchema.parse({
      amount: cell(mapping.amountColumn),
      originalCurrency,
    });
    if (
      context.statementCurrency &&
      money.originalCurrency !== context.statementCurrency.originalCurrency
    ) {
      throw new Error(
        'Row currency conflicts with declared statement currency'
      );
    }
    values.push(money);
    if (mapping.granularity === 'statement_line') {
      lines.push(
        royaltyStatementLineSchema.parse({
          statementId: context.statementId,
          lineId: `record:${index + 1}`,
          sourceRecordId: `record:${index + 1}`,
          isrc: field('isrc'),
          upc: field('upc'),
          title: field('title'),
          store: field('store'),
          territory: field('territory'),
          quantity: field('quantity'),
          usage: field('usage') ?? 'other',
          periods: context.periods,
          money,
          settlementMoney: null,
          exchangeRate: null,
          sourceLocator: `data-record:${index + 1}`,
        })
      );
    }
  }
  if (
    mapping.granularity === 'statement_summary' &&
    new Set(values.map(value => value.originalCurrency)).size !== values.length
  ) {
    throw new Error('Summary reports require one total per currency');
  }
  return receipt(input, context, {
    entryMode: 'explicit_column_mapping',
    mapping,
    mappingSha256: sha256(JSON.stringify(mapping)),
    manualValues: null,
    statement: {
      header: {
        contractVersion: 'jovie.royalty-statement/v1',
        statementId: context.statementId,
        granularity: mapping.granularity,
        issuedOn: context.issuedOn,
        periods: context.periods,
        totals: totalMoney(values),
        source: {
          ...source,
          parser: { id: 'jovie.explicit-column-mapping', version: '1.0.0' },
        },
        sourceLocator: 'complete-report',
      },
      lines,
    },
  });
}

/** Manual transcription from the retained original; no PDF parsing or OCR. */
export function enterDistributorStatementSummary(
  input: ReportInput & { readonly values: unknown }
): DistributorReportReceipt {
  const source = authorizeSource(input.actorUserId, input.source, input.bytes);
  const context = distributorReportContextSchema.parse(input.context);
  const values = z
    .array(manualSummaryValueSchema)
    .min(1)
    .max(128)
    .parse(input.values);
  if (
    !context.statementCurrency ||
    values.some(
      value =>
        value.money.originalCurrency !==
        context.statementCurrency?.originalCurrency
    )
  ) {
    throw new Error(
      'Summary values require matching declared currency evidence'
    );
  }
  if (
    new Set(values.map(value => value.money.originalCurrency)).size !==
    values.length
  ) {
    throw new Error('Summary reports require one total per currency');
  }
  return receipt(input, context, {
    entryMode: 'manual_summary',
    mapping: null,
    mappingSha256: null,
    manualValues: values,
    statement: {
      header: {
        contractVersion: 'jovie.royalty-statement/v1',
        statementId: context.statementId,
        granularity: 'statement_summary',
        issuedOn: context.issuedOn,
        periods: context.periods,
        totals: values.map(value => value.money),
        source: {
          ...source,
          parser: { id: 'jovie.manual-statement-summary', version: '1.0.0' },
        },
        sourceLocator: values
          .map(value => `page:${value.page};section:${value.section}`)
          .join('\n'),
      },
      lines: [],
    },
  });
}
