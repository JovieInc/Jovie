import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLE,
  summarizeDeliverability,
} from '@/lib/email/stream-deliverability';
import {
  findHardViolations,
  getStreamDomain,
  isCoreDomain,
  isProviderAllowedForStream,
  requireStreamDomain,
  senderDomainOf,
  separationGaps,
  streamForSenderDomain,
} from '@/lib/email/streams';

describe('email streams', () => {
  it('defaults keep production on send.jov.ie and leave cold closed', () => {
    expect(getStreamDomain('transactional', {})).toBe('send.jov.ie');
    expect(getStreamDomain('founder', {})).toBe('send.jov.ie');
    expect(getStreamDomain('cold', {})).toBeNull();
    expect(() => requireStreamDomain('cold', {})).toThrow(/no sending domain/);
  });

  it('env moves a stream to its own domain and clears the separation gap', () => {
    expect(separationGaps({}).map(g => g.stream)).toEqual([
      'lifecycle',
      'founder',
    ]);
    const env = {
      EMAIL_STREAM_LIFECYCLE_DOMAIN: 'notify.jov.ie',
      EMAIL_STREAM_FOUNDER_DOMAIN: ' Notify.jov.ie. ',
    };
    expect(separationGaps(env)).toEqual([]);
    expect(requireStreamDomain('founder', env)).toBe('notify.jov.ie');
  });

  it.each(['jov.ie', 'mail.jov.ie', '@Send.JOV.ie.'])(
    'refuses cold on core domain %s',
    domain => {
      const env = { EMAIL_STREAM_COLD_DOMAIN: domain };
      expect(findHardViolations(env)).toHaveLength(1);
      expect(() => requireStreamDomain('cold', env)).toThrow(
        /never uses jov\.ie/
      );
    }
  );

  it('allows cold on a separate domain and does not confuse lookalikes with core', () => {
    const env = { EMAIL_STREAM_COLD_DOMAIN: 'meetjovie.com' };
    expect(findHardViolations(env)).toEqual([]);
    expect(requireStreamDomain('cold', env)).toBe('meetjovie.com');
    expect(isCoreDomain('notjov.ie')).toBe(false);
    expect(isCoreDomain('jov.ie.evil.com')).toBe(false);
  });

  it('restricts providers by stream (Resend forbids cold, Cloudflare is transactional only)', () => {
    expect(isProviderAllowedForStream('resend', 'cold')).toBe(false);
    expect(isProviderAllowedForStream('resend', 'lifecycle')).toBe(true);
    expect(isProviderAllowedForStream('cloudflare-email', 'lifecycle')).toBe(
      false
    );
    expect(isProviderAllowedForStream('instantly', 'cold')).toBe(true);
  });

  it('parses sender domains', () => {
    expect(senderDomainOf('Tim White <tim@Send.jov.ie>')).toBe('send.jov.ie');
    expect(senderDomainOf('a@b.co')).toBe('b.co');
    expect(senderDomainOf('nope')).toBeNull();
    expect(streamForSenderDomain('send.jov.ie', {})).toBe('transactional');
    expect(streamForSenderDomain('other.com', {})).toBe('unknown');
  });
});

describe('stream deliverability summary', () => {
  const rows = (d: number, b: number, c: number, domain = 'send.jov.ie') => [
    { senderDomain: domain, status: 'delivered', count: d },
    { senderDomain: domain, status: 'bounced', count: b },
    { senderDomain: domain, status: 'complained', count: c },
  ];

  it('does not judge a rate below the sample floor', () => {
    const out = summarizeDeliverability(rows(10, 5, 1), {}, 7, new Date(0));
    expect(out.domains[0]).toMatchObject({
      status: 'insufficient-data',
      bounceRate: null,
    });
    expect(out.ok).toBe(true);
    expect(MIN_SAMPLE).toBe(50);
  });

  it('flags complaint and bounce breaches against the stream threshold', () => {
    const out = summarizeDeliverability(rows(1000, 50, 2), {}, 7, new Date(0));
    expect(out.domains[0]?.status).toBe('breach');
    expect(out.domains[0]?.breaches).toHaveLength(2);
    expect(out.ok).toBe(false);
  });

  it('passes clean traffic and reports hard violations', () => {
    expect(
      summarizeDeliverability(rows(1000, 5, 0), {}, 7, new Date(0)).ok
    ).toBe(true);
    const bad = summarizeDeliverability(
      [],
      { EMAIL_STREAM_COLD_DOMAIN: 'x.jov.ie' },
      7,
      new Date(0)
    );
    expect(bad.ok).toBe(false);
    expect(bad.hardViolations[0]?.rule).toBe('cold-on-core-domain');
  });

  it('buckets events without a sender domain as unattributed', () => {
    const out = summarizeDeliverability(
      rows(100, 0, 0, null as unknown as string),
      {},
      7,
      new Date(0)
    );
    expect(out.domains[0]).toMatchObject({
      domain: 'unattributed',
      stream: 'unknown',
    });
  });
});
