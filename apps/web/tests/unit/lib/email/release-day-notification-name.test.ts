import { describe, expect, it } from 'vitest';
import type { ReleaseDayNotificationData } from '@/lib/email/templates/release-day-notification';
import {
  getReleaseDayNotificationHtml,
  getReleaseDayNotificationSubject,
  getReleaseDayNotificationText,
} from '@/lib/email/templates/release-day-notification';

/** Minimal valid fixture shared across all tests */
const baseData: ReleaseDayNotificationData = {
  artistName: 'Dua Lipa',
  releaseTitle: 'Radical Optimism',
  artworkUrl: 'https://cdn.example.com/art.jpg',
  username: 'dualipa',
  slug: 'radical-optimism',
  streamingLinks: [
    { providerId: 'spotify', url: 'https://open.spotify.com/album/123' },
  ],
};

describe('release day notification subscriber name personalization', () => {
  describe('getReleaseDayNotificationText', () => {
    it('prefixes greeting when subscriberName is provided', () => {
      const text = getReleaseDayNotificationText({
        ...baseData,
        subscriberName: 'Sarah',
      });

      expect(text).toMatch(/^Hey Sarah, /);
      expect(text).toContain('Dua Lipa just dropped new music');
    });

    it('omits greeting when subscriberName is absent', () => {
      const text = getReleaseDayNotificationText(baseData);

      expect(text).not.toContain('Hey ');
      expect(text).toMatch(/^Dua Lipa just dropped new music/);
    });

    it('strips control characters from subscriberName', () => {
      const text = getReleaseDayNotificationText({
        ...baseData,
        subscriberName: 'Sa\r\nra\th',
      });

      expect(text).toMatch(/^Hey Sarah, /);
      expect(text).not.toMatch(/[\r\n\t].*Dua Lipa/);
    });
  });

  describe('getReleaseDayNotificationHtml', () => {
    it('includes greeting paragraph when subscriberName is provided', () => {
      const html = getReleaseDayNotificationHtml({
        ...baseData,
        subscriberName: 'Sarah',
      });

      expect(html).toContain('Hey Sarah,</p>');
    });

    it('omits greeting paragraph when subscriberName is absent', () => {
      const html = getReleaseDayNotificationHtml(baseData);

      expect(html).not.toContain('Hey ');
    });

    it('escapes HTML characters in subscriberName to prevent XSS', () => {
      const html = getReleaseDayNotificationHtml({
        ...baseData,
        subscriberName: '<script>alert("xss")</script>',
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('getReleaseDayNotificationSubject', () => {
    it('is not affected by subscriberName', () => {
      const withName = getReleaseDayNotificationSubject({
        ...baseData,
        subscriberName: 'Sarah',
      });
      const withoutName = getReleaseDayNotificationSubject(baseData);

      expect(withName).toBe(withoutName);
      expect(withName).toBe('Dua Lipa just dropped new music');
    });
  });
});
