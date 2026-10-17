import { z } from 'zod';
import { DISTRIBUTOR_IDS } from './distributor-ids';

const reference = z.string().trim().min(1);
export const distributorIdSchema = z.enum(DISTRIBUTOR_IDS);
export const reportGranularitySchema = z.enum([
  'catalog_record',
  'statement_summary',
  'statement_line',
  'payout',
  'unknown',
]);
export const sourceFormatVersionSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('identified'), value: reference }),
  z.strictObject({ status: z.literal('unversioned') }),
  z.strictObject({ status: z.literal('unknown') }),
]);

/** Authorization to accept user-supplied evidence, never authority to log in. */
export const fileImportDefinitionSchema = z
  .strictObject({
    id: distributorIdSchema,
    label: reference,
    transport: z.literal('file_import'),
    approval: z.strictObject({
      status: z.literal('approved'),
      scope: z.literal('account_holder_supplied_files'),
      evidenceRef: reference,
      requiresPerImportReceipt: z.literal(true),
    }),
    reports: z
      .array(
        z.strictObject({
          documentationUrl: z.url(),
          documentationStatus: z.enum(['documented', 'unverified']),
          format: z.enum(['csv', 'pdf', 'unknown']),
          formatVersion: sourceFormatVersionSchema,
          granularity: reportGranularitySchema,
        })
      )
      .min(1)
      .readonly(),
    capabilities: z
      .array(
        z.strictObject({
          id: z.enum(['catalog.import', 'statements.import', 'payouts.import']),
          availability: z.literal('unavailable'),
          reason: reference,
        })
      )
      .length(3)
      .readonly(),
    automatedAccess: z.strictObject({
      availability: z.literal('unavailable'),
      reason: reference,
    }),
  })
  .superRefine((definition, ctx) => {
    if (
      new Set(definition.capabilities.map(capability => capability.id)).size !==
      3
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'Declare each import capability exactly once',
      });
    }
    for (const [index, report] of definition.reports.entries()) {
      if (
        report.documentationStatus === 'unverified' &&
        (report.format !== 'unknown' ||
          report.granularity !== 'unknown' ||
          report.formatVersion.status !== 'unknown')
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['reports', index],
          message: 'Unverified reports cannot claim formats or granularity',
        });
      }
    }
  });
export type FileImportConnectorDefinition = z.infer<
  typeof fileImportDefinitionSchema
>;

/** JOV-8430 authorizes contracts; parser availability requires its own evidence. */
export const DISTRIBUTOR_IMPORT_DECISION = {
  shipNow:
    'Accept only account-holder-authorized file evidence under validated contracts.',
  reevaluateWhen:
    'Official documentation, approved scopes, credentials, and a successful read receipt all exist for the exact automated capability.',
  then: 'Review and enable only that evidenced transport and capability; unsupported capabilities remain unavailable.',
} as const;
