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
      resolveAuthShellBackLink(
        new URLSearchParams('redirect_url=%2Fonboarding%3Fhandle%3Dmotion')
      )
    ).toEqual({
      href: '/onboarding?handle=motion',
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

describe('auth mailbox syntax', () => {
  it.each([
    'artist@example.com',
    'Artist.Name+signup@sub.example.com',
    "o'connor@example.com",
    'artist_name@my-label.example.com',
    'e2e+jov8342@example.com',
    'canary+jovie-prod-canary@test.jovie.com',
    '  artist@example.com  ',
    `${'a'.repeat(64)}@example.com`,
    `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`,
  ])('preserves valid mailbox %s', email => {
    expect(isAuthEmailAddress(email)).toBe(true);
  });

  it.each([
    '<script>@example.com',
    'artist,name@example.com',
    'artíst@example.com',
    'artist@-example.com',
    'artist@example-.com',
    'artist@sub.-example.com',
    'artist@sub.example-.com',
    'artist@sub..example.com',
    'artist..name@example.com',
    '.artist@example.com',
    'artist.@example.com',
    '"artist"@example.com',
    'artist name@example.com',
    'artist@example_com',
    'artist@@example.com',
    'artist@example.com\u0000',
    `${'a'.repeat(65)}@example.com`,
    `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,
    `artist@${'a'.repeat(64)}.com`,
  ])('rejects malformed or oversized mailbox %s', email => {
    expect(isAuthEmailAddress(email)).toBe(false);
  });
});
