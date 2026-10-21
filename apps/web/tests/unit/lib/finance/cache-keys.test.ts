import { describe, expect, it } from 'vitest';
import {
  financeCacheKey,
  isForeignFinanceCacheKey,
} from '@/lib/finance/cache-keys';

const OWNER_A = '11111111-2222-3333-4444-555555555555';
const OWNER_B = '99999999-8888-7777-6666-555555555555';

describe('financeCacheKey', () => {
  it('builds owner-scoped keys as fin:<owner>:<scope>', () => {
    expect(financeCacheKey(OWNER_A, 'accounts')).toBe(
      `fin:${OWNER_A}:accounts`
    );
    expect(financeCacheKey(OWNER_B, 'budgets')).toBe(`fin:${OWNER_B}:budgets`);
  });

  it('rejects non-UUID owners with the owner-id error', () => {
    expect(() => financeCacheKey('creator_1', 'accounts')).toThrow(
      'Invalid financial owner id'
    );
  });

  it.each([
    ['empty scope', ''],
    ['scope with a separator', 'a:b'],
    ['scope ending in a separator', 'accounts:'],
  ])('rejects %s with a scope TypeError', (_label, scope) => {
    expect(() => financeCacheKey(OWNER_A, scope)).toThrow(
      new TypeError('Finance cache scope must be a non-empty segment')
    );
  });
});

describe('isForeignFinanceCacheKey', () => {
  it('flags finance keys belonging to another owner', () => {
    expect(isForeignFinanceCacheKey(`fin:${OWNER_B}:accounts`, OWNER_A)).toBe(
      true
    );
  });

  it('does not flag the owner’s own finance keys', () => {
    expect(isForeignFinanceCacheKey(`fin:${OWNER_A}:accounts`, OWNER_A)).toBe(
      false
    );
  });

  it('flags a key that only shares the owner as a prefix without the separator', () => {
    // `fin:<owner>x:...` is not the owner's namespace.
    expect(isForeignFinanceCacheKey(`fin:${OWNER_A}x:accounts`, OWNER_A)).toBe(
      true
    );
  });

  it('does not flag non-finance keys', () => {
    expect(isForeignFinanceCacheKey('creator:abc:dashboard', OWNER_A)).toBe(
      false
    );
    expect(isForeignFinanceCacheKey(`finance:${OWNER_B}:x`, OWNER_A)).toBe(
      false
    );
  });

  it('rejects a non-UUID owner before inspecting the key', () => {
    expect(() =>
      isForeignFinanceCacheKey(`fin:${OWNER_B}:accounts`, 'creator_1')
    ).toThrow('Invalid financial owner id');
  });
});
