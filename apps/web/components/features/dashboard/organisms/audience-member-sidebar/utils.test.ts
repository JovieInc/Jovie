import { describe, expect, it } from 'vitest';
import { computeMemberSubtitle, computeMemberTitle } from './utils';

describe('audience member sidebar identity copy', () => {
  it.each<[Parameters<typeof computeMemberTitle>[0], string]>([
    [null, 'Anonymous user'],
    [{ type: 'anonymous' }, 'Anonymous user'],
    [{ type: 'email' }, 'Audience member'],
    [
      {
        type: 'email',
        displayName: 'Maya Okafor',
        email: 'maya@example.com',
        phone: '+14155550123',
      },
      'Maya Okafor',
    ],
    [
      { type: 'email', email: 'maya@example.com', phone: '+14155550123' },
      'maya@example.com',
    ],
    [{ type: 'sms', phone: '+14155550123' }, '+14155550123'],
  ])('resolves the title for %j as %s', (member, expected) => {
    expect(computeMemberTitle(member)).toBe(expected);
  });

  it.each<[Parameters<typeof computeMemberSubtitle>[0], string]>([
    [null, 'Anonymous visitor'],
    [{ type: 'anonymous' }, 'Anonymous visitor'],
    [{ type: 'email', email: null }, 'Email subscriber'],
    [{ type: 'email', email: 'maya@example.com' }, 'maya@example.com'],
    [{ type: 'sms', phone: null }, 'SMS subscriber'],
    [{ type: 'sms', phone: '+14155550123' }, '+14155550123'],
    [{ type: 'spotify' }, 'Spotify connected'],
    [{ type: 'customer' }, 'Customer'],
    [{ type: 'unknown' }, 'Audience member'],
  ])('resolves the subtitle for %j as %s', (member, expected) => {
    expect(computeMemberSubtitle(member)).toBe(expected);
  });
});
