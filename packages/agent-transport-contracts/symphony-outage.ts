import { createHash, createPrivateKey, sign, verify } from 'node:crypto';
import { z } from 'zod';

const SCHEMA = 'jovie-symphony-health-transition/v1';
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9:_-]{8,128}$/;
const timestamp = z.string().datetime();
export const symphonyOutageHealthSchema = z
  .object({
    schema: z.literal(SCHEMA),
    eventId: z.string().regex(ID),
    service: z.literal('jovie-symphony'),
    port: z.literal(4041),
    repository: z.literal('JovieInc/Jovie'),
    sourceSha: z.string().regex(SHA),
    lastHealthyAt: timestamp,
    lostAt: timestamp,
    observedAt: timestamp,
    state: z.enum(['lost', 'healthy']),
    confirmed: z.literal(true),
    operatorHold: z.boolean(),
    origin: z.literal('service-health-observer'),
    attestation: z
      .object({
        algorithm: z.literal('Ed25519'),
        keyId: z.string(),
        signature: z.string(),
      })
      .strict(),
  })
  .strict();
export type SymphonyOutageHealth = z.infer<typeof symphonyOutageHealthSchema>;

export function canonicalOutageValue(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonicalOutageValue).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalOutageValue(item)}`
      )
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function outageHealthSigningPayload(
  health: Omit<SymphonyOutageHealth, 'attestation'>
): Buffer {
  return Buffer.from(`${SCHEMA}\0${canonicalOutageValue(health)}`);
}
export function outageIncidentId(
  health: Pick<SymphonyOutageHealth, 'service' | 'lastHealthyAt' | 'lostAt'>
): string {
  return createHash('sha256')
    .update(
      canonicalOutageValue({
        service: health.service,
        lastHealthyAt: health.lastHealthyAt,
        lostAt: health.lostAt,
      })
    )
    .digest('hex');
}
export function verifyOutageHealthProjection(
  value: unknown,
  keys: ReadonlyMap<string, string>
): SymphonyOutageHealth {
  const health = symphonyOutageHealthSchema.parse(value);
  const { attestation, ...unsigned } = health;
  const publicKey = keys.get(attestation.keyId);
  if (
    !publicKey ||
    !verify(
      null,
      outageHealthSigningPayload(unsigned),
      publicKey,
      Buffer.from(attestation.signature, 'base64url')
    )
  )
    throw new Error('untrusted health projection');
  return health;
}

export function signSymphonyOutageHealth(
  value: Omit<SymphonyOutageHealth, 'attestation'>,
  keyId: string,
  privateKeyPem: string
): SymphonyOutageHealth {
  const health = symphonyOutageHealthSchema
    .omit({ attestation: true })
    .parse(value);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(keyId))
    throw new Error('invalid producer key ID');
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519')
    throw new Error('Ed25519 producer key required');
  return {
    ...health,
    attestation: {
      algorithm: 'Ed25519',
      keyId,
      signature: sign(null, outageHealthSigningPayload(health), key).toString(
        'base64url'
      ),
    },
  };
}
