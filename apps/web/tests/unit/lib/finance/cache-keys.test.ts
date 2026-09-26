import { describe, expect, it } from 'vitest';
import {
  financeCacheKey,
  isForeignFinanceCacheKey,
} from '@/lib/finance/cache-keys';

const OWNER_A = '11111111-2222-3333-4444-555555555555';
const OWNER_B = '99999999-8888-7777-6666-555555555555';

describe('financeCacheKey', () => {
  it('builds owner-scoped keys', () => {
    expect(financeCacheKey(OWNER_A, 'accounts')).toBe(
      `fin:${OWNER_A}:accounts`
    );
  });

  it('rejects non-UUID owners and malformed scopes', () => {
    expect(() => financeCacheKey('creator_1', 'accounts')).toThrow();
    expect(() => financeCacheKey(OWNER_A, '')).toThrow();
    expect(() => financeCacheKey(OWNER_A, 'a:b')).toThrow();
  });
});

describe('isForeignFinanceCacheKey', () => {
  it('flags finance keys belonging to another owner', () => {
    expect(isForeignFinanceCacheKey(`fin:${OWNER_B}:accounts`, OWNER_A)).toBe(
      true
    );
    expect(isForeignFinanceCacheKey(`fin:${OWNER_A}:accounts`, OWNER_A)).toBe(
      false
    );
  });

  it('does not flag non-finance keys', () => {
    expect(isForeignFinanceCacheKey('creator:abc:dashboard', OWNER_A)).toBe(
      false
    );
  });
});
