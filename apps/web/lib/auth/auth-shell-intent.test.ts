import { describe, expect, it } from 'vitest';
import {
  AUTH_SHELL_HEADINGS,
  getAuthShellHeading,
  isAuthEmailAddress,
  normalizeAuthClaimHandle,
  resolveAuthShellBackLink,
  resolveAuthShellIntent,
} from './auth-shell-intent';

describe('auth shell intent', () => {
  it('names login, continue, and claim headings', () => {
    expect(getAuthShellHeading('sign-in')).toBe(AUTH_SHELL_HEADINGS['sign-in']);
    expect(getAuthShellHeading('continue')).toBe(AUTH_SHELL_HEADINGS.continue);
    expect(getAuthShellHeading('claim', 'motion')).toBe('Claim @motion');
    expect(getAuthShellHeading('claim')).toBe(AUTH_SHELL_HEADINGS.continue);
  });

  it('derives claim intent only for sign-up with a handle', () => {
    expect(resolveAuthShellIntent({ mode: 'sign-in' })).toBe('sign-in');
    expect(resolveAuthShellIntent({ mode: 'sign-up' })).toBe('continue');
    expect(
      resolveAuthShellIntent({ mode: 'sign-up', claimHandle: 'motion' })
    ).toBe('claim');
    expect(
      resolveAuthShellIntent({ mode: 'sign-in', claimHandle: 'motion' })
    ).toBe('sign-in');
  });

  it('normalizes claim handles and rejects invalid ones', () => {
    expect(normalizeAuthClaimHandle('@Motion')).toBe('motion');
    expect(normalizeAuthClaimHandle('ab')).toBeUndefined();
    expect(normalizeAuthClaimHandle('not a handle')).toBeUndefined();
  });

  it('points quiet back at the selected profile or chat step', () => {
    expect(
      resolveAuthShellBackLink(new URLSearchParams('handle=Motion'))
    ).toEqual({
      href: '/motion?claim=1',
      label: 'Back to @motion',
    });
    expect(
      resolveAuthShellBackLink(
        new URLSearchParams('redirect_url=%2Fstart%3Fhandle%3Dmotion')
      )
    ).toEqual({
      href: '/start?handle=motion',
      label: 'Back to chat',
    });
    expect(
      resolveAuthShellBackLink(new URLSearchParams('redirect_url=%2Fapp'))
    ).toBeNull();
  });

  it('accepts ordinary mailboxes and rejects empty or malformed values', () => {
    expect(isAuthEmailAddress('you@example.com')).toBe(true);
    expect(isAuthEmailAddress('')).toBe(false);
    expect(isAuthEmailAddress('not-an-email')).toBe(false);
    expect(isAuthEmailAddress('you@example')).toBe(false);
  });
});
