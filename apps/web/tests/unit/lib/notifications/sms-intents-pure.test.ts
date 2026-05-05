/**
 * Pure-logic tests for sms-intents helpers. Tests cover code generation,
 * hashing, and fingerprint computation — no DB calls.
 *
 * The DB-bound functions (createIntent, consumeIntentByCode,
 * getIntentForPolling) are tested separately at the api/integration layer.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {},
}));

beforeAll(() => {
  process.env.SMS_INTENT_SECRET ??= 'test-sms-intent-secret-32-chars!';
});

describe('generateIntentCode', () => {
  it('produces 8-char codes from the safe alphabet', async () => {
    const { generateIntentCode, INTENT_CODE_ALPHABET } = await import(
      '@/lib/notifications/sms-intents'
    );
    const code = generateIntentCode();
    expect(code).toHaveLength(8);
    for (const ch of code) {
      expect(INTENT_CODE_ALPHABET).toContain(ch);
    }
  });

  it('never emits I O 0 1 to avoid iOS autocorrect', async () => {
    const { generateIntentCode } = await import(
      '@/lib/notifications/sms-intents'
    );
    for (let i = 0; i < 200; i++) {
      const code = generateIntentCode();
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('produces high entropy across many draws', async () => {
    const { generateIntentCode } = await import(
      '@/lib/notifications/sms-intents'
    );
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateIntentCode());
    }
    // 200 random draws from ~1.1e12 keyspace → no collisions.
    expect(seen.size).toBe(200);
  });
});

describe('hashIntentCode', () => {
  it('is deterministic for the same input', async () => {
    const { hashIntentCode } = await import('@/lib/notifications/sms-intents');
    expect(hashIntentCode('J7K4Q2HZ')).toBe(hashIntentCode('J7K4Q2HZ'));
  });

  it('treats lowercase + whitespace + uppercase as the same code', async () => {
    const { hashIntentCode } = await import('@/lib/notifications/sms-intents');
    expect(hashIntentCode('j7k4q2hz')).toBe(hashIntentCode('J7K4Q2HZ'));
    expect(hashIntentCode(' J7K4Q2HZ ')).toBe(hashIntentCode('J7K4Q2HZ'));
  });

  it('produces different hashes for different codes', async () => {
    const { hashIntentCode } = await import('@/lib/notifications/sms-intents');
    expect(hashIntentCode('J7K4Q2HZ')).not.toBe(hashIntentCode('J7K4Q2HX'));
  });

  it('returns 64 hex chars (sha256)', async () => {
    const { hashIntentCode } = await import('@/lib/notifications/sms-intents');
    const hash = hashIntentCode('J7K4Q2HZ');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('computeIntentFingerprint', () => {
  it('is deterministic for the same inputs', async () => {
    const { computeIntentFingerprint } = await import(
      '@/lib/notifications/sms-intents'
    );
    const inputs = {
      visitorId: 'v1',
      ipHash: 'iph',
      userAgentHash: 'uah',
      artistId: 'artist-1',
    };
    expect(computeIntentFingerprint(inputs)).toBe(
      computeIntentFingerprint(inputs)
    );
  });

  it('changes when artistId changes', async () => {
    const { computeIntentFingerprint } = await import(
      '@/lib/notifications/sms-intents'
    );
    const a = computeIntentFingerprint({
      visitorId: 'v1',
      ipHash: 'iph',
      userAgentHash: 'uah',
      artistId: 'artist-1',
    });
    const b = computeIntentFingerprint({
      visitorId: 'v1',
      ipHash: 'iph',
      userAgentHash: 'uah',
      artistId: 'artist-2',
    });
    expect(a).not.toBe(b);
  });

  it('tolerates missing optional fields', async () => {
    const { computeIntentFingerprint } = await import(
      '@/lib/notifications/sms-intents'
    );
    const result = computeIntentFingerprint({ artistId: 'artist-1' });
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('hashIpAddress / hashUserAgent', () => {
  it('returns null for null input', async () => {
    const { hashIpAddress, hashUserAgent } = await import(
      '@/lib/notifications/sms-intents'
    );
    expect(hashIpAddress(null)).toBeNull();
    expect(hashIpAddress(undefined)).toBeNull();
    expect(hashUserAgent(null)).toBeNull();
  });

  it('produces deterministic hex hash for known input', async () => {
    const { hashIpAddress } = await import('@/lib/notifications/sms-intents');
    const a = hashIpAddress('203.0.113.5');
    const b = hashIpAddress('203.0.113.5');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
