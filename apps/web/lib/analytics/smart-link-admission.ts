import type { BotDetectionResult } from '@/lib/utils/bot-detection';

const META_CRAWLER_USER_AGENT = /(?:facebookexternalhit|facebot)/i;

/**
 * Meta in-app browsers include Instagram/WhatsApp product tokens, so the
 * shared conservative detector marks them as Meta. Exclude only crawler-
 * specific signatures while preserving its known-crawler/datacenter checks.
 */
export function isSmartLinkCrawler(detection: BotDetectionResult): boolean {
  if (!detection.isBot) return false;
  if (detection.reason !== 'Meta crawler detected') return true;
  return META_CRAWLER_USER_AGENT.test(detection.userAgent);
}
