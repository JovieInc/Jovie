import { z } from 'zod';
import {
  distributorIdSchema,
  sourceFormatVersionSchema,
} from './file-import-contract';

const reference = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.iso.date();
/** No Number conversion, exponent notation, separators, symbols, or rounding. */
export const exactDecimalSchema = z
  .string()
  .max(128)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const currencies = new Set<string>(Intl.supportedValuesOf('currency'));
export const originalCurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(value => currencies.has(value), 'Unsupported currency code');
export const royaltyMoneySchema = z.strictObject({
  amount: exactDecimalSchema,
  originalCurrency: originalCurrencySchema,
});
export const royaltyPeriodSchema = z
  .strictObject({
    start: date,
    end: date,
  })
  .refine(period => period.start <= period.end, 'Period ends before it starts');
const periods = z.strictObject({
  activity: royaltyPeriodSchema.nullable(),
  reporting: royaltyPeriodSchema.nullable(),
  payment: royaltyPeriodSchema.nullable(),
});

/** Receipt references are private durable ids, never access tokens or passwords. */
export const royaltySourceSchema = z
  .strictObject({
    distributorId: distributorIdSchema,
    accountId: reference,
    transport: z.literal('file_import'),
    fileName: reference,
    fileSha256: sha256,
    importedAt: z.iso.datetime(),
    format: z.enum(['csv', 'tsv', 'xlsx', 'pdf', 'json']),
    formatVersion: sourceFormatVersionSchema,
    parser: z.strictObject({
      id: reference,
      version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
    }),
    approval: z.strictObject({
      receiptRef: reference,
      approvedByUserId: reference,
      approvedAt: z.iso.datetime(),
      distributorId: distributorIdSchema,
      accountId: reference,
      fileSha256: sha256,
      purpose: z.literal('royalty_import'),
      authority: z.literal('account_holder'),
    }),
  })
  .superRefine((source, ctx) => {
    for (const field of ['distributorId', 'accountId', 'fileSha256'] as const) {
      if (source[field] !== source.approval[field]) {
        ctx.addIssue({
          code: 'custom',
          path: ['approval', field],
          message:
            'Approval must bind the source account, distributor, and file',
        });
      }
    }
    if (
      Date.parse(source.approval.approvedAt) > Date.parse(source.importedAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['approval', 'approvedAt'],
        message: 'Approval must precede import',
      });
    }
  });
const locator = reference.describe(
  'Original row, sheet/row, page, or source record id'
);
const identifiers = {
  sourceRecordId: reference,
  isrc: z
    .string()
    .regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/)
    .nullable(),
  upc: z
    .string()
    .regex(/^\d{12,13}$/)
    .nullable(),
};
export const royaltyCatalogRecordSchema = z.strictObject({
  contractVersion: z.literal('jovie.royalty-catalog/v1'),
  kind: z.enum(['recording', 'release']),
  ...identifiers,
  title: reference,
  artists: z.array(reference).min(1),
  source: royaltySourceSchema,
  sourceLocator: locator,
});
export const royaltyStatementHeaderSchema = z.strictObject({
  contractVersion: z.literal('jovie.royalty-statement/v1'),
  statementId: reference,
  granularity: z.enum(['statement_line', 'statement_summary']),
  issuedOn: date.nullable(),
  periods,
  // Each total retains its own currency; totals are never an inferred payout.
  totals: z.array(royaltyMoneySchema).min(1),
  source: royaltySourceSchema,
  sourceLocator: locator,
});
export const royaltyStatementLineSchema = z
  .strictObject({
    statementId: reference,
    lineId: reference,
    ...identifiers,
    title: reference.nullable(),
    store: reference.nullable(),
    territory: reference.nullable(),
    usage: z.enum([
      'stream',
      'download',
      'sale',
      'license',
      'adjustment',
      'other',
    ]),
    quantity: exactDecimalSchema.nullable(),
    periods,
    money: royaltyMoneySchema,
    settlementMoney: royaltyMoneySchema.nullable(),
    exchangeRate: exactDecimalSchema.nullable(),
    sourceLocator: locator,
  })
  .superRefine((line, ctx) => {
    if (
      line.exchangeRate !== null &&
      !line.exchangeRate.startsWith('-') &&
      /[1-9]/.test(line.exchangeRate) &&
      line.settlementMoney !== null
    )
      return;
    if (line.exchangeRate !== null || line.settlementMoney !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['exchangeRate'],
        message:
          'Conversion requires a positive exact rate and settlement amount',
      });
    }
  });
export const royaltyStatementSchema = z
  .strictObject({
    header: royaltyStatementHeaderSchema,
    lines: z.array(royaltyStatementLineSchema),
  })
  .superRefine((statement, ctx) => {
    if (
      statement.header.granularity === 'statement_summary' &&
      statement.lines.length > 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Summary evidence cannot claim statement lines',
      });
    }
    const ids = new Set<string>();
    for (const [index, line] of statement.lines.entries()) {
      if (
        line.statementId !== statement.header.statementId ||
        ids.has(line.lineId)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index],
          message: 'Lines must belong to this statement and have unique ids',
        });
      }
      ids.add(line.lineId);
    }
  });
export const royaltyPayoutEvidenceSchema = z
  .strictObject({
    contractVersion: z.literal('jovie.royalty-payout/v1'),
    payoutId: reference,
    statementIds: z.array(reference),
    status: z.enum(['provider_reported', 'bank_confirmed']),
    money: royaltyMoneySchema,
    periods,
    paidOn: date.nullable(),
    confirmationEvidenceRef: reference.nullable(),
    source: royaltySourceSchema,
    sourceLocator: locator,
  })
  .superRefine((payout, ctx) => {
    if (
      payout.status === 'bank_confirmed' &&
      (!payout.paidOn ||
        !payout.confirmationEvidenceRef ||
        !payout.periods.payment)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmationEvidenceRef'],
        message:
          'Confirmed payout requires payment date, period, and independent evidence',
      });
    }
  });

export type ExactDecimal = z.infer<typeof exactDecimalSchema>;
export type RoyaltyMoney = z.infer<typeof royaltyMoneySchema>;
export type RoyaltyPeriod = z.infer<typeof royaltyPeriodSchema>;
export type RoyaltySource = z.infer<typeof royaltySourceSchema>;
export type RoyaltyCatalogRecord = z.infer<typeof royaltyCatalogRecordSchema>;
export type RoyaltyStatementHeader = z.infer<
  typeof royaltyStatementHeaderSchema
>;
export type RoyaltyStatementLine = z.infer<typeof royaltyStatementLineSchema>;
export type RoyaltyStatement = z.infer<typeof royaltyStatementSchema>;
export type RoyaltyPayoutEvidence = z.infer<typeof royaltyPayoutEvidenceSchema>;
