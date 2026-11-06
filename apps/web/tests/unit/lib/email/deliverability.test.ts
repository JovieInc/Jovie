import { describe, expect, it } from 'vitest';
import {
  forgeReadiness,
  type OutcomeRow,
  summarizeDeliverability,
} from '@/lib/email/deliverability/summary';

const now = new Date('2026-10-29T12:00:00Z');

function rows(
  stream: string | null,
  domain: string | null,
  delivered: number,
  bounced: number,
  complained: number
): OutcomeRow[] {
  return [
    { stream, senderDomain: domain, status: 'delivered', count: delivered },
    { stream, senderDomain: domain, status: 'bounced', count: bounced },
    { stream, senderDomain: domain, status: 'complained', count: complained },
  ];
}

const summarize = (input: OutcomeRow[], forgeEligible: boolean | null = null) =>
  summarizeDeliverability(input, { env: {}, now, forgeEligible });

describe('email deliverability summary', () => {
  it('does not judge a stream below the sample floor', () => {
    const s = summarize(rows('broadcast', 'send.jov.ie', 10, 5, 2));
    expect(s.streams[0]).toMatchObject({
      stream: 'broadcast',
      status: 'insufficient-data',
      bounceRate: null,
    });
    expect(s.ok).toBe(true);
  });

  it('warns above the Resend complaint line and pauses above the Gmail line', () => {
    // 1 complaint in 1000 = 0.1%: over 0.08% warn, at (not over) 0.1% pause.
    expect(
      summarize(rows('broadcast', 'send.jov.ie', 1000, 0, 1)).streams[0]?.status
    ).toBe('warn');
    // 2 in 1000 = 0.2%: over the 0.1% pause line for broadcast.
    const paused = summarize(rows('broadcast', 'send.jov.ie', 1000, 0, 2));
    expect(paused.streams[0]?.status).toBe('pause');
    expect(paused.ok).toBe(false);
  });

  it('holds transactional to the 0.3% hard line before calling it pause', () => {
    expect(
      summarize(rows('transactional', 'send.jov.ie', 1000, 0, 2)).streams[0]
        ?.status
    ).toBe('warn');
    expect(
      summarize(rows('transactional', 'send.jov.ie', 1000, 0, 4)).streams[0]
        ?.status
    ).toBe('pause');
  });

  it('pauses on bounces over 4% and warns over 2%', () => {
    expect(
      summarize(rows('lifecycle', 'send.jov.ie', 970, 30, 0)).streams[0]?.status
    ).toBe('warn');
    expect(
      summarize(rows('lifecycle', 'send.jov.ie', 950, 50, 0)).streams[0]?.status
    ).toBe('pause');
  });

  it('attributes untagged events by sender domain and reports per domain', () => {
    const s = summarize([
      ...rows(null, 'jovie.fm', 100, 0, 0),
      ...rows('transactional', 'send.jov.ie', 100, 0, 0),
      ...rows('broadcast', 'send.jov.ie', 100, 0, 0),
    ]);
    expect(s.streams.map(x => x.stream)).toEqual([
      'broadcast',
      'inbox',
      'transactional',
    ]);
    expect(s.domains.find(d => d.domain === 'send.jov.ie')).toMatchObject({
      delivered: 200,
      streams: ['broadcast', 'transactional'],
    });
  });
});

describe('Resend Forge readiness', () => {
  it('is never ready without Resend eligibility', () => {
    const s = summarize(rows('transactional', 'send.jov.ie', 600, 1, 0), null);
    expect(s.forge.ready).toBe(false);
    expect(s.forge.blockers[0]).toMatch(/eligibility unknown/);
  });

  it('needs real, clean volume on every live stream', () => {
    const thin = summarize(
      rows('transactional', 'send.jov.ie', 100, 0, 0),
      true
    );
    expect(thin.forge.ready).toBe(false);
    const clean = summarize(
      rows('transactional', 'send.jov.ie', 600, 1, 0),
      true
    );
    expect(clean.forge).toEqual({ ready: true, blockers: [] });
    expect(forgeReadiness([], true).ready).toBe(false);
  });
});
