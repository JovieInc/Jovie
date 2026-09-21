import { describe, expect, it } from 'vitest';
import type { BotDetectionResult } from '@/lib/utils/bot-detection';
import { isSmartLinkCrawler } from './smart-link-admission';

function detection(
  userAgent: string,
  reason = 'Meta crawler detected'
): BotDetectionResult {
  return {
    isBot: true,
    isMeta: reason === 'Meta crawler detected',
    reason,
    shouldBlock: false,
    userAgent,
  };
}

describe('isSmartLinkCrawler', () => {
  it.each([
    'Instagram 321.0.0.0.1 (iPhone; iOS 18.0)',
    'WhatsApp/2.24.19 iOS/18.0',
    'Mozilla/5.0 [FBAN/FBIOS;FBAV/480.0]',
  ])('keeps Meta in-app browser traffic: %s', userAgent => {
    expect(isSmartLinkCrawler(detection(userAgent))).toBe(false);
  });

  it.each(['facebookexternalhit/1.1', 'Facebot/1.0'])(
    'excludes Meta crawler traffic: %s',
    userAgent => {
      expect(isSmartLinkCrawler(detection(userAgent))).toBe(true);
    }
  );

  it('preserves non-Meta crawler detection', () => {
    expect(
      isSmartLinkCrawler(detection('Googlebot/2.1', 'Known crawler detected'))
    ).toBe(true);
  });
});
