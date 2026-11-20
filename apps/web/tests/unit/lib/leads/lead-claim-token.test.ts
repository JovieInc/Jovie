import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  sets: [] as Array<Record<string, unknown>>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: { RESEND_API_KEY: 'test-resend-key' },
}));
vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        hoisted.sets.push(values);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    })),
  },
}));

import {
  deriveLeadClaimToken,
  ensureLeadClaimToken,
  mintLeadClaimToken,
  persistLeadClaimToken,
  resolveLeadClaimToken,
} from '@/lib/leads/lead-claim-token';
import { hashClaimToken } from '@/lib/security/claim-token';

const LEAD = '123e4567-e89b-12d3-a456-426614174000';
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('lead claim token (hashed at rest)', () => {
  beforeEach(() => {
    hoisted.sets.length = 0;
  });

  it('derives a stable UUID-shaped token per lead and expiry', () => {
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    const a = deriveLeadClaimToken(LEAD, expiresAt);
    expect(a).toMatch(UUID_V4);
    expect(deriveLeadClaimToken(LEAD, expiresAt)).toBe(a);
    expect(deriveLeadClaimToken('other-lead', expiresAt)).not.toBe(a);
    expect(
      deriveLeadClaimToken(LEAD, new Date(expiresAt.getTime() + 1000))
    ).not.toBe(a);
  });

  it('resolves the plaintext only when it matches the stored hash and is unexpired', async () => {
    const pair = await mintLeadClaimToken(LEAD);
    const row = {
      id: LEAD,
      claimTokenHash: pair.tokenHash,
      claimTokenExpiresAt: pair.expiresAt,
    };

    expect(await resolveLeadClaimToken(row)).toBe(pair.token);
    expect(await hashClaimToken(pair.token)).toBe(pair.tokenHash);
    expect(
      await resolveLeadClaimToken({ ...row, claimTokenHash: 'f'.repeat(64) })
    ).toBeNull();
    expect(
      await resolveLeadClaimToken({ ...row, claimTokenExpiresAt: new Date(0) })
    ).toBeNull();
    expect(
      await resolveLeadClaimToken({ ...row, claimTokenHash: null })
    ).toBeNull();
  });

  it('reuses a derivable token and rotates a legacy random one', async () => {
    const pair = await mintLeadClaimToken(LEAD);
    const reused = await ensureLeadClaimToken({
      id: LEAD,
      claimTokenHash: pair.tokenHash,
      claimTokenExpiresAt: pair.expiresAt,
    });
    expect(reused).toMatchObject({ token: pair.token, rotated: false });

    const legacyHash = await hashClaimToken(crypto.randomUUID());
    const rotated = await ensureLeadClaimToken({
      id: LEAD,
      claimTokenHash: legacyHash,
      claimTokenExpiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(rotated.rotated).toBe(true);
    expect(rotated.tokenHash).not.toBe(legacyHash);
  });

  it('persists the hash on the lead and its profile and never the plaintext', async () => {
    const pair = await mintLeadClaimToken(LEAD);

    await persistLeadClaimToken(LEAD, 'profile-1', pair);

    expect(hoisted.sets).toHaveLength(2);
    for (const values of hoisted.sets) {
      expect(JSON.stringify(values)).not.toContain(pair.token);
      expect(values).not.toHaveProperty('claimToken', pair.token);
    }
    expect(hoisted.sets[0]).toMatchObject({ claimTokenHash: pair.tokenHash });
    expect(hoisted.sets[1]).toMatchObject({ claimToken: pair.tokenHash });
  });
});
