import { describe, expect, it } from 'vitest';
import { detectRepresentation } from '@/lib/leads/management-filter';

describe('detectRepresentation', () => {
  it('flags management email prefixes', () => {
    expect(detectRepresentation('booking@agency.com', null)).toEqual({
      hasRepresentation: true,
      signal: 'Email prefix: booking@',
    });
  });

  it('flags bio keyword for inquiries', () => {
    expect(
      detectRepresentation(
        null,
        'Independent artist — for inquiries contact team'
      )
    ).toEqual({
      hasRepresentation: true,
      signal: 'Bio keyword: for inquiries',
    });
  });
});
