import { describe, expect, it } from 'vitest';
import { renderAudienceEventSentence } from '@/lib/audience/activity-grammar';

describe('audience activity grammar', () => {
  it('renders Spotify clicks as checked out instead of listened', () => {
    const sentence = renderAudienceEventSentence({
      eventType: 'content_checked_out',
      objectLabel: 'Neon Nights',
      platform: 'spotify',
    });

    expect(sentence.kind).toBe('sentence');
    if (sentence.kind === 'sentence') {
      expect(sentence.text).toBe('Someone Checked Out Neon Nights On Spotify');
      expect(sentence.text).not.toMatch(/listened/i);
    }
  });

  it('does not claim YouTube clicks were watched', () => {
    const sentence = renderAudienceEventSentence({
      eventType: 'content_checked_out',
      objectLabel: 'Tour Recap',
      platform: 'youtube',
    });

    expect(sentence.kind).toBe('sentence');
    if (sentence.kind === 'sentence') {
      expect(sentence.text).toBe('Someone Checked Out Tour Recap On YouTube');
      expect(sentence.text).not.toMatch(/watched/i);
    }
  });

  it('renders Venmo-style tip opens as opened tip link', () => {
    const sentence = renderAudienceEventSentence({
      eventType: 'tip_link_opened',
    });

    expect(sentence.kind).toBe('sentence');
    if (sentence.kind === 'sentence') {
      expect(sentence.text).toBe('Someone Opened Tip Link');
      expect(sentence.text).not.toBe('Someone Sent A Tip');
    }
  });

  it('renders verified tips as sent a tip', () => {
    const sentence = renderAudienceEventSentence({
      eventType: 'tip_sent',
      confidence: 'verified',
    });

    expect(sentence.kind).toBe('sentence');
    if (sentence.kind === 'sentence') {
      expect(sentence.text).toBe('Someone Sent A Tip');
    }
  });

  it('renders QR source scans with source label', () => {
    const sentence = renderAudienceEventSentence({
      eventType: 'source_scanned',
      sourceKind: 'qr',
      sourceLabel: 'O2 Arena Sticker',
    });

    expect(sentence.kind).toBe('sentence');
    if (sentence.kind === 'sentence') {
      expect(sentence.text).toBe('Someone Scanned O2 Arena Sticker');
    }
  });

  it('sanitizes legacy listened and watched labels', () => {
    const sentence = renderAudienceEventSentence({
      eventType: 'legacy',
      label: 'listened and watched latest release',
    });

    expect(sentence.kind).toBe('sentence');
    if (sentence.kind === 'sentence') {
      expect(sentence.text).toBe('Checked Out And Checked Out Latest Release');
    }
  });
});
