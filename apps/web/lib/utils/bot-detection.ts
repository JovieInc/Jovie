/**
 * Bot Detection Utilities with Anti-Cloaking Compliance
 * Conservative bot detection to avoid anti-cloaking penalties
 */

import { NextRequest } from 'next/server';

export interface BotDetectionResult {
  isBot: boolean;
  isMeta: boolean;
  reason: string;
  shouldBlock: boolean;
  userAgent: string;
  asn?: number;
}

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
 * Detects if request is from a bot with anti-cloaking considerations
 */
export function detectBot(
  request: NextRequest,
  endpoint?: string
): BotDetectionResult {
  const userAgent = request.headers.get('user-agent') || '';

  // Check for Meta crawlers
  const isMeta = META_USER_AGENTS.some(agent =>
    userAgent.toLowerCase().includes(agent.toLowerCase())
  );

  // Check for other known crawlers
  const isKnownCrawler = KNOWN_CRAWLERS.some(bot =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );

  const isBot = isMeta || isKnownCrawler;

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
  }

  return {
    isBot,
    isMeta,
    reason,
    shouldBlock,
    userAgent,
  };
}

/**
 * Checks if IP belongs to Meta ASN
 */
export async function checkMetaASN(): Promise<boolean> {
  // In production, you'd query an IP-to-ASN service
  // For demo, we'll just return false to avoid blocking legitimate users
  // Note: IP parameter removed as it's not currently used
  return false;
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
  // Bot detection logging is disabled in this version
  // Consider implementing with alternative storage if needed
  console.log(`Bot detection: ${ip} - ${reason} - blocked: ${blocked}`);
}

/**
 * Conservative rate limiting to avoid appearing like cloaking
 */

export async function checkRateLimit(
  ip: string,
  endpoint: string
): Promise<boolean> {
  // Rate limiting is disabled in this version
  // Always return false (not rate limited) for now
  // Consider implementing with Redis/Upstash if needed
  console.log(`Rate limit check: ${ip} - ${endpoint} (disabled)`);
  return false;
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
 * Checks if request should be treated as suspicious
 */
export function isSuspiciousRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';

  // Check for suspicious patterns
  const suspiciousPatterns = [
    // Empty or suspicious user agents
    /^$/,
    /curl/i,
    /wget/i,
    /python/i,
    /bot/i,
    /spider/i,
    /crawler/i,
    // But don't block legitimate tools that might be used by users
  ];

  // Only flag obviously suspicious requests
  const hasSuspiciousUA =
    suspiciousPatterns.some(pattern => pattern.test(userAgent)) &&
    !userAgent.includes('Mozilla'); // Don't flag browser-based tools

  return hasSuspiciousUA;
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
