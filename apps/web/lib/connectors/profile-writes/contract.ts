import { createHash } from 'node:crypto';
import { z } from 'zod';

const valuesSchema = z
  .object({
    bio: z.string().max(10_000).nullable().optional(),
    bioLink: z.string().url().nullable().optional(),
    image: z.string().url().nullable().optional(),
    website: z.string().url().nullable().optional(),
  })
  .strict()
  .refine(values => Object.keys(values).length > 0);

const snapshotSchema = z.object({
  values: valuesSchema,
  version: z.string().min(1).max(256),
  observedAt: z.string().datetime(),
});

export type ProfileValues = z.infer<typeof valuesSchema>;
export type DestinationSnapshot = z.infer<typeof snapshotSchema>;

export const providerWriteResultSchema = z.object({
  status: z.enum(['applied', 'partial', 'rejected']),
  version: z.string().min(1).max(256).nullable(),
  receipt: z.unknown().refine(value => value !== null && value !== undefined),
});

export interface ProfileWriteManifest {
  /** Email receipts attest submission only; they never attest a destination mutation. */
  readonly operation?: 'email-submission';
  readonly recipient?: string;
  readonly maxBioLength?: number;
  readonly providerId: string;
  readonly version: string;
  readonly fields: readonly (keyof ProfileValues)[];
  readonly requiredScopes: readonly string[];
  readonly termsApproved: boolean;
  readonly evidenceRef: string;
  readonly evidenceExpiresAt: string;
  readonly rollback: 'conditional-restore' | 'manual' | 'unsupported';
  /** One write per destination account per fixed window, shared across fields. */
  readonly rateLimitWindowSeconds: number;
}

export interface ProfileDestination {
  readonly creatorProfileId?: string;
  readonly connectorAccountId: string;
  readonly destinationAccountId: string;
  readonly providerId: string;
}

export interface ProfileWriteProposal extends ProfileDestination {
  readonly operation?: 'email-submission';
  readonly recipient?: string;
  readonly id: string;
  readonly userId: string;
  readonly manifestVersion: string;
  readonly manifestDigest: string;
  readonly evidenceRef: string;
  readonly before: DestinationSnapshot;
  readonly desired: ProfileValues;
  readonly expiresAt: string;
  readonly rollbackOf: string | null;
}

export type ReceiptPhase = 'proposal' | 'approval' | 'started' | 'outcome';
export type ReceiptResult =
  | 'proposed'
  | 'approved'
  | 'started'
  | 'submitted'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'unknown'
  | 'blocked';

export interface ProfileWriteReceipt {
  readonly id: string;
  readonly phase: ReceiptPhase;
  readonly proposal: ProfileWriteProposal;
  readonly approvalId: string | null;
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly requestMetadata: unknown;
  readonly before: DestinationSnapshot;
  readonly after: DestinationSnapshot | null;
  readonly providerReceipt: unknown;
  readonly result: ReceiptResult;
  readonly reason: string | null;
  readonly startedAt: string;
  readonly recordedAt: string;
}

/** Implementations must use shared durable storage; append must commit before resolving. */
export interface ProfileWriteLedger {
  authorize(
    userId: string,
    destination: ProfileDestination,
    scopes: readonly string[]
  ): Promise<boolean>;
  get(
    userId: string,
    proposalId: string,
    phase: ReceiptPhase
  ): Promise<ProfileWriteReceipt | null>;
  /** False means a unique phase or rate window was already claimed. */
  append(receipt: ProfileWriteReceipt, rateKey?: string): Promise<boolean>;
}

export interface ProfileWriteAdapter {
  readonly manifest: ProfileWriteManifest;
  read(destination: ProfileDestination): Promise<DestinationSnapshot>;
  /** Mutations require atomic version rejection; submissions recheck the canonical source. */
  write(input: {
    destination: ProfileDestination;
    expectedVersion: string;
    values: ProfileValues;
    idempotencyKey: string;
    manifestDigest: string;
  }): Promise<z.infer<typeof providerWriteResultSchema>>;
}

export function digest(value: unknown): string {
  // All persisted inputs are JSON. Sort recursively so field order is immaterial.
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)])
      );
    }
    return input;
  };
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}

/** Opaque provider payloads are retained as a fingerprint plus allowlisted metadata. */
export function redactProviderReceipt(value: unknown): unknown {
  const parsed = z
    .object({ statusCode: z.number().int().min(100).max(599).optional() })
    .safeParse(value);
  return {
    sha256: digest(value ?? null),
    ...(parsed.success ? parsed.data : {}),
  };
}

export function safeValues(input: unknown): ProfileValues {
  const values = valuesSchema.parse(input);
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined) throw new Error('incomplete-destination-snapshot');
    if (value === null) continue;
    if (field !== 'bio') {
      const url = new URL(value);
      // Signed URLs cannot be durable restore artifacts. Never store their credentials.
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('unsafe-destination-value');
    }
    if (
      /bearer\s+\S+|(?:access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)\s*[:=]|eyJ[\w-]+\.[\w-]+\.[\w-]+/i.test(
        value
      )
    ) {
      throw new Error('unsafe-destination-value');
    }
  }
  return values;
}

export function safeSnapshot(input: unknown): DestinationSnapshot {
  const snapshot = snapshotSchema.parse(input);
  return { ...snapshot, values: safeValues(snapshot.values) };
}

export function confirmationFor(proposal: ProfileWriteProposal): string {
  return digest(proposal);
}
