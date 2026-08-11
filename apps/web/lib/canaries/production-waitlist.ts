import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PRODUCTION_WAITLIST_CANARY_ANALYTICS_EVENT } from './production-waitlist-client';

export {
  PRODUCTION_WAITLIST_CANARY_ANALYTICS_EVENT,
  PRODUCTION_WAITLIST_CANARY_RUN_HEADER,
} from './production-waitlist-client';

export const PRODUCTION_WAITLIST_CANARY_NAME = 'production-waitlist' as const;

const CANARY_NAMESPACE = 'jovie-prod-waitlist-canary';
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RESERVED_EMAIL_PATTERN = /^[^@+]+\+jovie-prod-waitlist-canary@[^@]+$/;

export const PRODUCTION_WAITLIST_CANARY_COMMUNICATIONS = {
  waitlistConfirmationEmail: 'suppressed-before-enqueue',
  slack: 'suppressed',
} as const;

export const PRODUCTION_WAITLIST_CANARY_COMMUNICATION_POLICY = {
  waitlistConfirmationEmail: 'suppressed-before-enqueue',
  slack: 'suppressed-before-provider-call',
} as const;

const passedSchema = z.literal('passed');
const communicationPolicySchema = z.object({
  waitlistConfirmationEmail: z.literal('suppressed-before-enqueue'),
  slack: z.literal('suppressed-before-provider-call'),
});

export const productionWaitlistCanaryMarkerSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.literal(PRODUCTION_WAITLIST_CANARY_NAME),
  runId: z.string().regex(RUN_ID_PATTERN),
  communications: z.object({
    waitlistConfirmationEmail: z.literal('suppressed-before-enqueue'),
    slack: z.literal('suppressed'),
  }),
});

export const productionWaitlistAnalyticsReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.literal(PRODUCTION_WAITLIST_CANARY_NAME),
  runId: z.string().regex(RUN_ID_PATTERN),
  event: z.literal(PRODUCTION_WAITLIST_CANARY_ANALYTICS_EVENT),
});

export type ProductionWaitlistCanaryMarker = z.infer<
  typeof productionWaitlistCanaryMarkerSchema
>;

export const productionWaitlistPreflightReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  canary: z.literal(PRODUCTION_WAITLIST_CANARY_NAME),
  environment: z.literal('production'),
  emailSha256: z.string().regex(/^[a-f0-9]{64}$/),
  communicationPolicy: communicationPolicySchema,
  assertions: z.object({
    exactIdentityConfigured: passedSchema,
    readScopeConfigured: passedSchema,
    communicationsFailClosed: passedSchema,
  }),
});

export const productionWaitlistDurableReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  canary: z.literal(PRODUCTION_WAITLIST_CANARY_NAME),
  runId: z.string().regex(RUN_ID_PATTERN),
  emailSha256: z.string().regex(/^[a-f0-9]{64}$/),
  entryId: z.string().uuid(),
  assertions: z.object({
    database: z.object({
      identityLinkage: passedSchema,
      session: passedSchema,
      waitlistEntry: passedSchema,
      waitlistAudit: passedSchema,
    }),
    analytics: z.object({ firstPartyWaitlistConfirmation: passedSchema }),
    communications: z.object({
      policy: communicationPolicySchema,
      emailJobCount: z.literal(0),
      auditSuppressionMarker: passedSchema,
    }),
  }),
});

export type DurableProductionWaitlistReceipt = z.infer<
  typeof productionWaitlistDurableReceiptSchema
>;

export const productionWaitlistIncompleteReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  canary: z.literal(PRODUCTION_WAITLIST_CANARY_NAME),
  runId: z.string().regex(RUN_ID_PATTERN),
  emailSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal('incomplete'),
  missing: z
    .array(
      z.enum([
        'identity_linkage',
        'session',
        'waitlist_entry',
        'waitlist_audit',
        'analytics_receipt',
        'email_job_suppression',
      ])
    )
    .min(1),
});

function splitBaseEmail(baseEmail: string): readonly [string, string] {
  const match = baseEmail
    .trim()
    .toLowerCase()
    .match(/^([^@+]+)@([^@]+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error(
      'E2E_PROD_SIGNUP_EMAIL_BASE must be a base address without plus-tagging'
    );
  }
  return [match[1], match[2]];
}

/**
 * One durable production identity, intentionally independent of a workflow run.
 * Reusing it makes the canary non-destructive and prevents account accumulation.
 */
export function buildProductionWaitlistCanaryEmail(baseEmail: string): string {
  const [local, domain] = splitBaseEmail(baseEmail);
  return `${local}+${CANARY_NAMESPACE}@${domain}`;
}

export function isExactProductionWaitlistCanaryEmail(
  email: string,
  baseEmail: string | undefined
): boolean {
  if (!baseEmail?.trim()) return false;
  try {
    return (
      email.trim().toLowerCase() ===
      buildProductionWaitlistCanaryEmail(baseEmail)
    );
  } catch {
    return false;
  }
}

/**
 * Configuration-independent safety boundary for side-effect suppression.
 * Authorization still requires isExactProductionWaitlistCanaryEmail.
 */
export function hasProductionWaitlistCanaryNamespace(email: string): boolean {
  return RESERVED_EMAIL_PATTERN.test(email.trim().toLowerCase());
}

export function parseProductionWaitlistCanaryRunId(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const runId = value.trim().toLowerCase();
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error('Invalid production waitlist canary run id');
  }
  return runId;
}

export function buildProductionWaitlistCanaryMarker(
  runId: string
): ProductionWaitlistCanaryMarker {
  const parsedRunId = parseProductionWaitlistCanaryRunId(runId);
  if (!parsedRunId) {
    throw new Error('Production waitlist canary run id is required');
  }
  return {
    schemaVersion: 1,
    name: PRODUCTION_WAITLIST_CANARY_NAME,
    runId: parsedRunId,
    communications: PRODUCTION_WAITLIST_CANARY_COMMUNICATIONS,
  };
}

export function hashProductionWaitlistCanaryEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function readProductionWaitlistCanaryMarker(
  value: unknown
): ProductionWaitlistCanaryMarker | null {
  const parsed = productionWaitlistCanaryMarkerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readProductionWaitlistAnalyticsReceipt(value: unknown) {
  const parsed = productionWaitlistAnalyticsReceiptSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
