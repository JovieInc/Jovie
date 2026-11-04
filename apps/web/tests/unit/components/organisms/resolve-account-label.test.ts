import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_LABEL_FALLBACK,
  resolveAccountLabel,
} from '@/components/organisms/user-button/resolve-account-label';

describe('resolveAccountLabel', () => {
  it('prefers the artist display name', () => {
    expect(
      resolveAccountLabel({ artistName: 'Luna Vale', artistHandle: 'luna' })
    ).toBe('Luna Vale');
  });
  it('uses a real user name before the handle', () => {
    expect(
      resolveAccountLabel({ fullName: 'Ada Lovelace', artistHandle: 'ada' })
    ).toBe('Ada Lovelace');
  });
  it('falls back to the @handle when there is no name', () => {
    expect(
      resolveAccountLabel({ artistName: '  ', artistHandle: 'luna' })
    ).toBe('@luna');
    expect(resolveAccountLabel({ artistHandle: '@luna' })).toBe('@luna');
  });
  it('shows Account when nothing real exists, never an email-derived name', () => {
    const label = resolveAccountLabel({});
    expect(label).toBe(ACCOUNT_LABEL_FALLBACK);
    expect(label).toBe('Account');
  });
});
