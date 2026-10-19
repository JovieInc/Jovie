import { z } from 'zod';
import {
  distributorIdSchema,
  sourceFormatVersionSchema,
} from './file-import-contract';
import {
  originalCurrencySchema,
  royaltyMoneySchema,
  royaltyStatementHeaderSchema,
  royaltyStatementSchema,
} from './royalty-contract';

const reference = z.string().trim().min(1).max(2048);
const column = z.string().min(1).max(256);
export const monetaryBasisSchema = z.enum(['gross_earnings', 'net_earnings']);
export const statementCurrencyEvidenceSchema = z.strictObject({
  originalCurrency: originalCurrencySchema,
  sourceLocator: reference,
});

/** Serializable, immutable versions; storage must key by owner/id/version. */
export const distributorColumnMappingSchema = z
  .strictObject({
    contractVersion: z.literal('jovie.distributor-column-mapping/v1'),
    id: reference,
    ownerUserId: reference,
    distributorId: distributorIdSchema,
    accountId: reference,
    version: z.number().int().positive(),
    sourceFormatVersion: sourceFormatVersionSchema,
    columns: z.array(column).min(1).max(128),
    granularity: z.enum(['statement_line', 'statement_summary']),
    monetaryBasis: monetaryBasisSchema,
    amountColumn: column,
    currency: z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('column'), column }),
      z.strictObject({ mode: z.literal('statement') }),
    ]),
    fields: z.strictObject({
      isrc: column.optional(),
      upc: column.optional(),
      title: column.optional(),
      store: column.optional(),
      territory: column.optional(),
      quantity: column.optional(),
      usage: column.optional(),
    }),
  })
  .superRefine((mapping, ctx) => {
    const selected = [
      mapping.amountColumn,
      ...(mapping.currency.mode === 'column' ? [mapping.currency.column] : []),
      ...Object.values(mapping.fields),
    ];
    if (
      new Set(mapping.columns).size !== mapping.columns.length ||
      new Set(selected).size !== selected.length ||
      selected.some(value => !mapping.columns.includes(value))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns'],
        message: 'Require unique headers and distinct, present mapped columns',
      });
    }
    if (mapping.sourceFormatVersion.status === 'unknown') {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceFormatVersion'],
        message:
          'Explicitly identify the report version or declare it unversioned',
      });
    }
    if (
      mapping.granularity === 'statement_summary' &&
      Object.keys(mapping.fields).length > 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields'],
        message: 'Summary evidence cannot claim track or line attributes',
      });
    }
  });

export const distributorReportContextSchema = royaltyStatementHeaderSchema
  .pick({ statementId: true, issuedOn: true, periods: true })
  .extend({
    originalEvidenceRef: reference,
    monetaryBasis: monetaryBasisSchema,
    monetaryBasisLocator: reference,
    currencyLocator: reference,
    statementCurrency: statementCurrencyEvidenceSchema.nullable(),
  })
  .refine(
    context =>
      context.periods.activity !== null || context.periods.reporting !== null,
    'An activity or reporting period is required for overlap checks'
  );

export const manualSummaryValueSchema = z.strictObject({
  money: royaltyMoneySchema,
  page: z.number().int().positive(),
  section: reference,
});

/** Full evidence envelope: do not persist just the normalized statement. */
export const distributorReportReceiptSchema = z
  .strictObject({
    contractVersion: z.literal('jovie.distributor-report/v1'),
    ownerUserId: reference,
    originalEvidenceRef: reference,
    entryMode: z.enum(['explicit_column_mapping', 'manual_summary']),
    monetaryBasis: monetaryBasisSchema,
    monetaryBasisLocator: reference,
    currencyLocator: reference,
    statementCurrency: statementCurrencyEvidenceSchema.nullable(),
    mapping: distributorColumnMappingSchema.nullable(),
    mappingSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    manualValues: z.array(manualSummaryValueSchema).min(1).max(128).nullable(),
    statement: royaltyStatementSchema,
  })
  .superRefine((receipt, ctx) => {
    const { source, granularity } = receipt.statement.header;
    const mapping = receipt.mapping;
    if (
      receipt.ownerUserId !== source.approval.approvedByUserId ||
      (receipt.entryMode === 'manual_summary'
        ? mapping !== null ||
          receipt.mappingSha256 !== null ||
          receipt.manualValues === null ||
          granularity !== 'statement_summary' ||
          JSON.stringify(receipt.manualValues.map(value => value.money)) !==
            JSON.stringify(receipt.statement.header.totals)
        : mapping === null ||
          receipt.mappingSha256 === null ||
          receipt.manualValues !== null ||
          mapping.ownerUserId !== receipt.ownerUserId ||
          mapping.distributorId !== source.distributorId ||
          mapping.accountId !== source.accountId ||
          mapping.granularity !== granularity ||
          mapping.monetaryBasis !== receipt.monetaryBasis)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Inconsistent report evidence or owner scope',
      });
    }
  });

export type DistributorColumnMapping = z.infer<
  typeof distributorColumnMappingSchema
>;
export type DistributorReportContext = z.infer<
  typeof distributorReportContextSchema
>;
export type DistributorReportReceipt = z.infer<
  typeof distributorReportReceiptSchema
>;
export type ManualSummaryValue = z.infer<typeof manualSummaryValueSchema>;
