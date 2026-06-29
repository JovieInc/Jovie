import { describe, expect, it } from 'vitest';
import { FIXTURE_BOOKING_EMAILS } from '@/lib/connectors/gmail/__fixtures__/booking-emails';
import {
  extractCalendarMentions,
  extractGmailMentions,
} from './parse-mentions';

describe('connector enrichment parse-mentions', () => {
  it('extracts sender and venue mentions from booking fixture emails', () => {
    const output = FIXTURE_BOOKING_EMAILS.slice(0, 3).flatMap(email =>
      extractGmailMentions({
        subject: email.subject,
        from: email.from,
        snippet: email.snippet,
      })
    );

    expect(output.some(mention => mention.name.includes('Output'))).toBe(true);
    expect(
      output.some(mention => mention.factKind === 'location_mentioned')
    ).toBe(true);
    expect(output.every(mention => mention.confidence >= 0.7)).toBe(true);
  });

  it('returns no mentions for prompt-injection fixture email', () => {
    const injection = FIXTURE_BOOKING_EMAILS.find(
      email => email.id === 'fixture-msg-005'
    );
    expect(injection).toBeDefined();

    const mentions = extractGmailMentions({
      subject: injection!.subject,
      from: injection!.from,
      snippet: injection!.snippet,
    });

    expect(mentions.some(mention => mention.type === 'location')).toBe(false);
  });

  it('extracts studio location mentions from calendar payloads', () => {
    const mentions = extractCalendarMentions({
      summary: 'Studio session at Dim Mak Studio',
      location: 'Dim Mak Studio, Los Angeles',
      startsAt: '2026-06-01T22:00:00.000Z',
    });

    expect(
      mentions.some(mention => mention.factKind === 'studio_location')
    ).toBe(true);
    expect(mentions.some(mention => mention.name.includes('Dim Mak'))).toBe(
      true
    );
  });
});
