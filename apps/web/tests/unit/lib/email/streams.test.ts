import { describe, expect, it } from 'vitest';
import {
  CORE_DOMAIN,
  EMAIL_STREAM_REGISTRY,
  EMAIL_STREAMS,
  type EmailStreamRegistry,
  findHardViolations,
  getStreamDomain,
  isCoreDomain,
  isEmailStream,
  normalizeDomain,
  senderDomainOf,
  separationGaps,
  streamForSenderDomain,
  streamFromEmail,
  streamPolicy,
} from '@/lib/email/streams';

describe('email stream registry', () => {
  it('declares exactly the typed streams', () => {
    expect(Object.keys(EMAIL_STREAM_REGISTRY.streams).sort()).toEqual(
      [...EMAIL_STREAMS].sort()
    );
    expect(isEmailStream('broadcast')).toBe(true);
    expect(isEmailStream('newsletter')).toBe(false);
    expect(isEmailStream(undefined)).toBe(false);
  });

  it('keeps cold closed, off jov.ie and off the Resend account', () => {
    const cold = streamPolicy('cold');
    expect(cold.status).toBe('closed');
    expect(cold.provider).toBeNull();
    expect(EMAIL_STREAM_REGISTRY.providers.resend.streams).not.toContain(
      'cold'
    );
    expect(findHardViolations({})).toEqual([]);
  });

  it('flags cold pointed at jov.ie or any subdomain', () => {
    for (const domain of ['jov.ie', 'send.jov.ie', 'outreach.jov.ie.']) {
      expect(findHardViolations({ EMAIL_STREAM_COLD_DOMAIN: domain })).toEqual([
        expect.objectContaining({
          stream: 'cold',
          rule: 'cold-on-core-domain',
        }),
      ]);
    }
    expect(
      findHardViolations({ EMAIL_STREAM_COLD_DOMAIN: 'meetjovie.com' })
    ).toEqual([]);
  });

  it('flags cold on Resend and a provider that does not permit its stream', () => {
    const bad = structuredClone(EMAIL_STREAM_REGISTRY) as EmailStreamRegistry;
    (bad.streams.cold as { provider: string | null }).provider = 'resend';
    const rules = findHardViolations({}, bad).map(v => v.rule);
    expect(rules).toContain('cold-on-transactional-provider');
    expect(rules).toContain('provider-not-allowed');
  });

  it('resolves sending domains from env overrides, else the registry', () => {
    expect(getStreamDomain('transactional', {})).toBe('send.jov.ie');
    expect(
      getStreamDomain('lifecycle', {
        EMAIL_STREAM_LIFECYCLE_DOMAIN: ' Notify.Jov.ie ',
      })
    ).toBe('notify.jov.ie');
    expect(getStreamDomain('cold', {})).toBeNull();
    expect(streamFromEmail('transactional', {})).toBe(
      'notifications@send.jov.ie'
    );
    expect(streamFromEmail('cold', {})).toBeNull();
    expect(streamFromEmail('inbox', {})).toBeNull();
  });

  it('reports streams that still share the transactional reputation', () => {
    expect(separationGaps({}).map(g => g.stream)).toEqual([
      'lifecycle',
      'founder',
      'broadcast',
    ]);
    expect(
      separationGaps({
        EMAIL_STREAM_LIFECYCLE_DOMAIN: 'notify.jov.ie',
        EMAIL_STREAM_FOUNDER_DOMAIN: 'notify.jov.ie',
        EMAIL_STREAM_BROADCAST_DOMAIN: 'notify.jov.ie',
      })
    ).toEqual([]);
  });

  it('parses sender domains and attributes them to streams', () => {
    expect(senderDomainOf('Jovie <notifications@Send.Jov.ie>')).toBe(
      'send.jov.ie'
    );
    expect(senderDomainOf('tim@jov.ie')).toBe('jov.ie');
    expect(senderDomainOf('no address')).toBeNull();
    expect(senderDomainOf(undefined)).toBeNull();
    expect(streamForSenderDomain('send.jov.ie', {})).toBe('transactional');
    expect(streamForSenderDomain('jovie.fm', {})).toBe('inbox');
    expect(streamForSenderDomain('example.com', {})).toBe('unknown');
  });

  it('normalizes domains and recognises the core domain', () => {
    expect(CORE_DOMAIN).toBe('jov.ie');
    expect(normalizeDomain('@Send.Jov.ie.')).toBe('send.jov.ie');
    expect(isCoreDomain('jov.ie')).toBe(true);
    expect(isCoreDomain('send.jov.ie')).toBe(true);
    expect(isCoreDomain('notjov.ie')).toBe(false);
    expect(isCoreDomain('meetjovie.com')).toBe(false);
  });
});
