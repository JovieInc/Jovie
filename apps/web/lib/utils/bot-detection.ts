/**
 * Bot Detection Utilities with Anti-Cloaking Compliance
 * Conservative bot detection to avoid anti-cloaking penalties
 */

import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';

export interface BotDetectionResult {
  isBot: boolean;
  isMeta: boolean;
  reason: string;
  shouldBlock: boolean;
  userAgent: string;
  asn?: number;
}

export interface DetectBotOptions {
  readonly userAgent?: string | null;
  readonly asn?: number;
  readonly memberVisits?: number;
  readonly memberConversions?: number;
}

/** Minimum visits before the high-velocity zero-click heuristic applies. */
export const VELOCITY_BOT_MIN_VISITS = 40;

/** Maximum conversions allowed for the high-velocity zero-click heuristic. */
export const VELOCITY_BOT_MAX_CONVERSIONS = 0;

/**
 * Known cloud/hosting provider ASNs observed in datacenter-city traffic
 * (AWS, Azure, GCP, OCI, DigitalOcean, etc.).
 */
export const DATACENTER_ASNS = new Set([
  // Amazon AWS
  16509, 14618, 8987, 7224, 39111, 393406,
  // Microsoft Azure
  8075, 8068, 8069, 12076, 35106, 35908,
  // Google Cloud
  15169, 396982, 19527, 36040, 36039,
  // Oracle Cloud
  31898, 14340,
  // DigitalOcean
  14061,
  // Linode / Akamai
  63949,
  // Vultr
  20473,
  // Hetzner
  24940,
  // OVH
  16276,
  // Scaleway
  12876,
  // Alibaba Cloud
  45102, 37963,
  // Tencent Cloud
  132203, 45090,
  // IBM Cloud
  36351, 14148,
]);

// Conservative bot detection - only block obvious crawlers on sensitive endpoints
const META_USER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'facebook',
  'Instagram',
  'WhatsApp',
];

// Other crawlers to monitor (but not necessarily block)
const KNOWN_CRAWLERS = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'applebot',
  'twitterbot',
  'linkedinbot',
  'pinterestbot',
  'discordbot',
  'telegrambot',
  'skypebot',
];

/**
 * Extract ASN from CDN/proxy headers (Vercel, Cloudflare).
 */
export function extractAsnFromRequest(request: {
  headers: Headers;
}): number | undefined {
  const raw =
    request.headers.get('x-vercel-ip-asn')?.trim() ||
    request.headers.get('cf-ip-asn')?.trim() ||
    null;

  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function isDatacenterAsn(asn: number): boolean {
  return DATACENTER_ASNS.has(asn);
}

export function isHighVelocityZeroClickBot(
  visits: number,
  conversions: number
): boolean {
  return (
    visits >= VELOCITY_BOT_MIN_VISITS &&
    conversions <= VELOCITY_BOT_MAX_CONVERSIONS
  );
}

/**
 * Detects if request is from a bot with anti-cloaking considerations
 */
export function detectBot(
  request: NextRequest,
  endpoint?: string,
  options: DetectBotOptions = {}
): BotDetectionResult {
  const userAgent =
    options.userAgent ?? (request.headers.get('user-agent') || '');

  // Check for Meta crawlers
  const isMeta = META_USER_AGENTS.some(agent =>
    userAgent.toLowerCase().includes(agent.toLowerCase())
  );

  // Check for other known crawlers
  const isKnownCrawler = KNOWN_CRAWLERS.some(bot =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );

  const asn = options.asn ?? extractAsnFromRequest(request);
  const isDatacenter = asn !== undefined && isDatacenterAsn(asn);
  const isVelocityBot =
    options.memberVisits !== undefined &&
    options.memberConversions !== undefined &&
    isHighVelocityZeroClickBot(options.memberVisits, options.memberConversions);

  const isBot = isMeta || isKnownCrawler || isDatacenter || isVelocityBot;

  // Determine blocking strategy based on endpoint
  let shouldBlock = false;
  let reason = '';

  if (isMeta) {
    reason = 'Meta crawler detected';
    // Only block Meta crawlers on sensitive API endpoints
    shouldBlock = Boolean(
      endpoint?.includes('/api/link/') || endpoint?.includes('/api/sign/')
    );
  } else if (isKnownCrawler) {
    reason = 'Known crawler detected';
    // Don't block other crawlers to avoid anti-cloaking issues
  } else if (isDatacenter) {
    reason = 'datacenter_asn';
  } else if (isVelocityBot) {
    reason = 'high_velocity_zero_click';
  }

  return {
    isBot,
    isMeta,
    reason,
    shouldBlock,
    userAgent,
    asn,
  };
}

/**
 * Logs bot detection for monitoring
 */
export async function logBotDetection(
  ip: string,
  userAgent: string,
  reason: string,
  endpoint: string,
  blocked: boolean
): Promise<void> {
  // Bot detection logging via Sentry breadcrumbs
  Sentry.addBreadcrumb({
    category: 'bot-detection',
    message: `Bot detection: ${reason}`,
    level: blocked ? 'warning' : 'info',
    data: { ip, reason, blocked, endpoint },
  });
}

/**
 * Generates anti-cloaking safe error responses
 */
export function createBotResponse(status: number = 204): Response {
  // Return consistent responses to avoid cloaking detection
  if (status === 404) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

/**
 * Gets appropriate response headers for different client types
 */
export function getBotSafeHeaders(isBot: boolean): Record<string, string> {
  const baseHeaders = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Robots-Tag': 'noindex, nofollow, nosnippet, noarchive',
  };

  if (isBot) {
    return {
      ...baseHeaders,
      'Referrer-Policy': 'no-referrer',
    };
  }

  return baseHeaders;
}
