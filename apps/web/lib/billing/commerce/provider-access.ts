import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ACCESS_RECEIPT_VERSION = 'jovie.provider-access/v1';
export const MAX_ACCESS_AGE_MS = 24 * 60 * 60_000;
const text = z.string().trim().min(1).max(512);
const instant = z.iso.datetime({ offset: true });
export const providerSchema = z.enum(['openai', 'stripe']);
export const capabilitySchema = z.enum([
  'acp',
  'acs',
  'active-sku',
  'mpp',
  'ordinary-web-checkout',
  'plugin-subscription-checkout',
  'projects',
  'spt',
]);
export const skuSchema = z.strictObject({
  priceId: text.regex(/^price_/),
  active: z.boolean(),
  productActive: z.boolean(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().regex(/^[a-z]{3}$/),
  interval: z.enum(['month', 'year']).nullable(),
});
export const providerAccessReceiptSchema = z.strictObject({
  provider: providerSchema,
  account: text.nullable(),
  capability: capabilitySchema,
  resource: text.nullable(),
  environment: z.enum(['live', 'test', 'UNKNOWN']),
  observedAt: instant,
  expiresAt: instant,
  result: z.enum(['GRANTED', 'DENIED', 'UNKNOWN']),
  source: z.enum(['account-api', 'dashboard', 'unavailable']),
  verification: z.enum(['verified', 'unverifiable']),
  evidenceRef: text.nullable(),
  sku: skuSchema.nullable(),
});
const bundleSchema = z.strictObject({
  version: z.literal(ACCESS_RECEIPT_VERSION),
  receipts: z.array(providerAccessReceiptSchema).max(512),
});
export type ProviderAccessReceipt = z.infer<typeof providerAccessReceiptSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type Capability = z.infer<typeof capabilitySchema>;

/** Stable content revisions; object key and receipt order cannot change a decision. */
export function evidenceDigest(value: unknown): string {
  function stable(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b, 'en'))
          .map(([key, entry]) => [key, stable(entry)])
      );
    }
    return input;
  }
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

/** No receipt, credentials, documentation or dashboard guess implies access. */
export function importProviderAccess(input: unknown) {
  const parsed = bundleSchema.safeParse(input);
  const receipts = parsed.success ? parsed.data.receipts : [];
  return {
    valid: parsed.success,
    receipts,
    revision: evidenceDigest({
      valid: parsed.success,
      receipts: [
        ...new Set(receipts.map(receipt => JSON.stringify(receipt))),
      ].sort(),
    }),
  };
}
export type AccessEvidence = ReturnType<typeof importProviderAccess>;
export interface AccessRequest {
  provider: Provider;
  account: string | null;
  capability: Capability;
  resource?: string | null;
}

export function evaluateProviderAccess(
  evidence: AccessEvidence,
  request: AccessRequest,
  now: Date
) {
  const unknown = (reason: string) => ({
    ...request,
    resource: request.resource ?? null,
    result: 'UNKNOWN' as const,
    observedAt: null as string | null,
    expiresAt: null as string | null,
    reason,
    sku: null as ProviderAccessReceipt['sku'],
  });
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs))
    throw new Error('Invalid access evaluation clock');
  if (!evidence.valid) return unknown('invalid-access-receipts');
  if (!request.account) return unknown('account-unverified');
  const candidates = evidence.receipts
    .filter(
      receipt =>
        receipt.provider === request.provider &&
        receipt.account === request.account &&
        receipt.capability === request.capability &&
        receipt.resource === (request.resource ?? null) &&
        receipt.environment === 'live'
    )
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const latest = candidates[0];
  if (!latest) return unknown('account-capability-unobserved');
  const result = {
    ...unknown('unverifiable-evidence'),
    observedAt: latest.observedAt,
    expiresAt: latest.expiresAt,
  };
  if (
    candidates.some(
      receipt =>
        Date.parse(receipt.observedAt) === Date.parse(latest.observedAt) &&
        evidenceDigest(receipt) !== evidenceDigest(latest)
    )
  )
    return { ...result, reason: 'conflicting-observations' };
  const observedMs = Date.parse(latest.observedAt);
  const expiryMs = Date.parse(latest.expiresAt);
  if (
    observedMs > nowMs ||
    expiryMs <= nowMs ||
    expiryMs <= observedMs ||
    expiryMs - observedMs > MAX_ACCESS_AGE_MS ||
    nowMs - observedMs >= MAX_ACCESS_AGE_MS
  )
    return { ...result, reason: 'expired-or-invalid-observation' };
  if (
    latest.verification !== 'verified' ||
    latest.source === 'unavailable' ||
    !latest.evidenceRef
  )
    return result;
  return {
    ...result,
    result: latest.result,
    reason:
      latest.result === 'UNKNOWN'
        ? 'access-unknown'
        : 'verified-account-observation',
    sku: latest.sku,
  };
}
