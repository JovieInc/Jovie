/**
 * Email Extraction Utilities
 *
 * Extracts contact emails from various sources:
 * - Bio text
 * - Link titles and URLs
 * - HTML content (with anti-spam protection detection)
 */

import { logger } from '@/lib/utils/logger';

/**
 * Common email regex pattern
 * Matches most valid email addresses while avoiding false positives
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;

/**
 * Obfuscation patterns used by creators to prevent scraping
 * - "email at domain dot com"
 * - "email (at) domain (dot) com"
 * - "email [at] domain [dot] com"
 */
const OBFUSCATION_PATTERNS = [
  // "email at domain dot com" variants
  /\b([A-Za-z0-9._%+-]+)\s*(?:\(at\)|\[at\]|@|at)\s*([A-Za-z0-9.-]+)\s*(?:\(dot\)|\[dot\]|\.|\s+dot\s+)\s*([A-Za-z]{2,})\b/gi,
] as const;

/**
 * Email domains that are likely personal/contact emails (prioritize these)
 */
const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
];

/**
 * Domains that are likely not personal contact emails (deprioritize)
 */
const NON_PERSONAL_DOMAINS = [
  // Social platforms (not email)
  'twitter.com',
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'youtube.com',
  'spotify.com',
  // Music platforms (not email)
  'linktree.ee',
  'linktr.ee',
  'bio.link',
  'beacons.ai',
  // Image/asset hosts
  'cloudinary.com',
  'imgix.net',
  'vercel-storage.com',
];

/**
 * Validate an email address
 */
export function isValidEmail(email: string): boolean {
  // Basic format check
  if (!email || !email.includes('@')) return false;

  // Length check
  if (email.length > 254) return false;

  // Simple pattern check
  const basicPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicPattern.test(email)) return false;

  // Domain check - reject non-email domains
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  if (NON_PERSONAL_DOMAINS.some(d => domain.includes(d))) {
    return false;
  }

  return true;
}

/**
 * Score an email for quality/relevance
 * Higher score = better quality contact email
 */
function scoreEmail(email: string, context?: string): number {
  let score = 0;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const local = email.split('@')[0]?.toLowerCase() ?? '';

  // Personal domain bonus
  if (PERSONAL_EMAIL_DOMAINS.some(d => domain === d)) {
    score += 10;
  }

  // Custom domain (likely business email)
  if (
    !PERSONAL_EMAIL_DOMAINS.some(d => domain === d) &&
    !domain.includes('gmail') &&
    !domain.includes('yahoo')
  ) {
    score += 15; // Business emails are often better for outreach
  }

  // Role-based local parts (booking, management, etc.)
  const rolePatterns = [
    'booking',
    'management',
    'press',
    'contact',
    'info',
    'hello',
    'hi',
  ];
  if (rolePatterns.some(p => local.includes(p))) {
    score += 5;
  }

  // Context bonus - email appears near keywords
  if (context) {
    const contextLower = context.toLowerCase();
    if (/\b(contact|booking|email|reach|message)\b/i.test(contextLower)) {
      score += 5;
    }
    if (/\b(management|press|pr|promo)\b/i.test(contextLower)) {
      score += 3;
    }
  }

  // Penalize generic/spam-like patterns
  if (/^(no-?reply|noreply|unsubscribe|support|help)/i.test(local)) {
    score -= 20;
  }

  return score;
}

/**
 * Extract emails from obfuscated text
 */
function extractObfuscatedEmails(text: string): string[] {
  const emails: string[] = [];

  for (const pattern of OBFUSCATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const [, local, domain, tld] = match;
      if (local && domain && tld) {
        const email = `${local}@${domain}.${tld}`.toLowerCase();
        if (isValidEmail(email)) {
          emails.push(email);
        }
      }
    }
  }

  return emails;
}

/**
 * Extract emails from plain text (bio, description, etc.)
 */
export function extractEmailsFromText(text: string): string[] {
  if (!text) return [];

  const emails = new Set<string>();

  // Direct email matches
  const directMatches = text.match(EMAIL_REGEX) ?? [];
  for (const email of directMatches) {
    if (isValidEmail(email)) {
      emails.add(email.toLowerCase());
    }
  }

  // Obfuscated email matches
  for (const email of extractObfuscatedEmails(text)) {
    emails.add(email);
  }

  return Array.from(emails);
}

/**
 * Extract emails from mailto: links in HTML
 */
export function extractEmailsFromHtml(html: string): string[] {
  if (!html) return [];

  const emails = new Set<string>();

  // Extract from mailto: links
  const mailtoRegex = /href=["']mailto:([^"'?]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoRegex.exec(html)) !== null) {
    const email = decodeURIComponent(match[1]).toLowerCase();
    if (isValidEmail(email)) {
      emails.add(email);
    }
  }

  // Extract from text content (bio, descriptions)
  // Remove HTML tags first
  const textContent = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  for (const email of extractEmailsFromText(textContent)) {
    emails.add(email);
  }

  return Array.from(emails);
}

/**
 * Extracted email with metadata
 */
export interface ExtractedEmail {
  email: string;
  score: number;
  source: 'bio' | 'html' | 'mailto' | 'link_title';
  context?: string;
}

/**
 * Extract and rank emails from multiple sources
 */
export function extractAndRankEmails(params: {
  bio?: string | null;
  html?: string | null;
  linkTitles?: string[];
}): ExtractedEmail[] {
  const { bio, html, linkTitles } = params;
  const emailMap = new Map<string, ExtractedEmail>();

  // Extract from bio
  if (bio) {
    for (const email of extractEmailsFromText(bio)) {
      const existing = emailMap.get(email);
      const newScore = scoreEmail(email, bio);
      if (!existing || existing.score < newScore) {
        emailMap.set(email, {
          email,
          score: newScore,
          source: 'bio',
          context: bio.slice(0, 100),
        });
      }
    }
  }

  // Extract from HTML
  if (html) {
    for (const email of extractEmailsFromHtml(html)) {
      const existing = emailMap.get(email);
      const newScore = scoreEmail(email);
      if (!existing || existing.score < newScore) {
        emailMap.set(email, {
          email,
          score: newScore,
          source: 'html',
        });
      }
    }
  }

  // Extract from link titles (sometimes emails appear in link text)
  if (linkTitles) {
    for (const title of linkTitles) {
      for (const email of extractEmailsFromText(title)) {
        const existing = emailMap.get(email);
        const newScore = scoreEmail(email, title);
        if (!existing || existing.score < newScore) {
          emailMap.set(email, {
            email,
            score: newScore,
            source: 'link_title',
            context: title,
          });
        }
      }
    }
  }

  // Sort by score (highest first)
  return Array.from(emailMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Get the best contact email from extraction results
 */
export function getBestContactEmail(emails: ExtractedEmail[]): string | null {
  if (emails.length === 0) return null;

  // Return highest scored email
  const best = emails[0];

  // Require minimum score to avoid garbage
  if (best.score < 0) return null;

  logger.info('[Email Extraction] Selected best contact email', {
    email: best.email.slice(0, 3) + '***',
    score: best.score,
    source: best.source,
  });

  return best.email;
}
