import { describe, expect, it } from 'vitest';
import {
  type ColdComplianceContext,
  type ColdMessage,
  checkColdCompliance,
  isDeceptiveSubject,
  renderColdFooter,
} from './compliance';

const message: ColdMessage = {
  fromName: 'Tim White',
  fromAddress: 'tim@meetjovie.com',
  subject: 'Low Tide',
  body: 'Hey,\n\nI made a page.\n\nTim',
};

const context: ColdComplianceContext = {
  mailingAddress: '123 Example St, Suite 4, Los Angeles, CA 90012',
  unsubscribeUrl: 'https://meetjovie.com/u/abc',
  coldStream: { domain: 'meetjovie.com', onCoreDomain: false },
  suppressed: false,
  isFollowUp: false,
};

describe('checkColdCompliance', () => {
  it('passes a compliant message', () => {
    expect(checkColdCompliance(message, context)).toEqual({
      ok: true,
      failures: [],
    });
  });

  it('blocks every send until the mailing address is set (JOV-9648)', () => {
    expect(
      checkColdCompliance(message, { ...context, mailingAddress: null })
        .failures
    ).toContain('mailing_address_missing');
    expect(
      checkColdCompliance(message, { ...context, mailingAddress: 'TBD' })
        .failures
    ).toContain('mailing_address_missing');
  });

  it('blocks when the cold stream is closed or sits on jov.ie', () => {
    expect(
      checkColdCompliance(message, {
        ...context,
        coldStream: { domain: null, onCoreDomain: false },
      }).failures
    ).toContain('cold_stream_closed');
    expect(
      checkColdCompliance(
        { ...message, fromAddress: 'tim@out.jov.ie' },
        { ...context, coldStream: { domain: 'out.jov.ie', onCoreDomain: true } }
      ).failures
    ).toContain('cold_on_core_domain');
  });

  it('requires the from address to be on the cold domain', () => {
    expect(
      checkColdCompliance({ ...message, fromAddress: 'tim@jov.ie' }, context)
        .failures
    ).toContain('from_domain_mismatch');
  });

  it('requires an honest person name and an unsubscribe link', () => {
    expect(
      checkColdCompliance({ ...message, fromName: 'Jovie Team' }, context)
        .failures
    ).toContain('from_name_not_a_person');
    expect(
      checkColdCompliance(message, { ...context, unsubscribeUrl: null })
        .failures
    ).toContain('unsubscribe_missing');
  });

  it('never sends to someone suppressed on any stream', () => {
    expect(
      checkColdCompliance(message, { ...context, suppressed: true }).failures
    ).toContain('recipient_suppressed');
  });
});

describe('isDeceptiveSubject', () => {
  it.each([
    'Re: your page',
    'Fwd: hi',
    'Your invoice',
    'URGENT',
    'Congratulations',
    'Earn $500',
  ])('flags %s on a first touch', subject =>
    expect(isDeceptiveSubject(subject, false)).toBe(true)
  );
  it('allows a real reply marker on a follow-up and plain subjects', () => {
    expect(isDeceptiveSubject('Re: Low Tide', true)).toBe(false);
    expect(isDeceptiveSubject('Nova Lane page', false)).toBe(false);
  });
});

describe('renderColdFooter', () => {
  it('carries the address and unsubscribe link', () => {
    const footer = renderColdFooter({
      mailingAddress: context.mailingAddress as string,
      unsubscribeUrl: context.unsubscribeUrl as string,
    });
    expect(footer).toContain('Los Angeles');
    expect(footer).toContain('https://meetjovie.com/u/abc');
  });
});
