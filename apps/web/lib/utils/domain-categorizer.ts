/**
 * Domain Categorizer with Anti-Cloaking Safe Aliases
 * Categorizes domains and provides crawler-safe aliases
 */

import { extractDomain } from './url-parsing';

export interface DomainCategory {
  category: string | null;
  alias: string | null;
  kind: 'normal' | 'sensitive';
}

export interface SensitiveDomainRecord {
  domain: string;
  category: string;
  alias: string;
}

// Pre-defined sensitive domains with crawler-safe aliases
const SENSITIVE_DOMAINS: Record<string, SensitiveDomainRecord> = {
  // Adult Content - use generic entertainment terms
  'onlyfans.com': {
    domain: 'onlyfans.com',
    category: 'adult',
    alias: 'Premium Content',
  },
  'fansly.com': {
    domain: 'fansly.com',
    category: 'adult',
    alias: 'Exclusive Content',
  },
  'pornhub.com': {
    domain: 'pornhub.com',
    category: 'adult',
    alias: 'Entertainment',
  },
  'xvideos.com': {
    domain: 'xvideos.com',
    category: 'adult',
    alias: 'Entertainment',
  },
  'xhamster.com': {
    domain: 'xhamster.com',
    category: 'adult',
    alias: 'Entertainment',
  },
  'redtube.com': {
    domain: 'redtube.com',
    category: 'adult',
    alias: 'Entertainment',
  },
  'chaturbate.com': {
    domain: 'chaturbate.com',
    category: 'adult',
    alias: 'Live Streaming',
  },
  'cam4.com': {
    domain: 'cam4.com',
    category: 'adult',
    alias: 'Live Streaming',
  },
  'stripchat.com': {
    domain: 'stripchat.com',
    category: 'adult',
    alias: 'Live Streaming',
  },
  'myfreecams.com': {
    domain: 'myfreecams.com',
    category: 'adult',
    alias: 'Live Streaming',
  },

  // Gambling - use generic entertainment/sports terms
  'draftkings.com': {
    domain: 'draftkings.com',
    category: 'gambling',
    alias: 'Sports Entertainment',
  },
  'fanduel.com': {
    domain: 'fanduel.com',
    category: 'gambling',
    alias: 'Sports Entertainment',
  },
  'betmgm.com': {
    domain: 'betmgm.com',
    category: 'gambling',
    alias: 'Gaming Platform',
  },
  'caesars.com': {
    domain: 'caesars.com',
    category: 'gambling',
    alias: 'Entertainment',
  },
  'bet365.com': {
    domain: 'bet365.com',
    category: 'gambling',
    alias: 'Sports Platform',
  },
  'pokerstars.com': {
    domain: 'pokerstars.com',
    category: 'gambling',
    alias: 'Card Games',
  },
  '888casino.com': {
    domain: '888casino.com',
    category: 'gambling',
    alias: 'Gaming Platform',
  },
  'bovada.lv': {
    domain: 'bovada.lv',
    category: 'gambling',
    alias: 'Sports Platform',
  },

  // Crypto/Trading - use generic finance terms
  'coinbase.com': {
    domain: 'coinbase.com',
    category: 'crypto',
    alias: 'Digital Assets',
  },
  'binance.com': {
    domain: 'binance.com',
    category: 'crypto',
    alias: 'Trading Platform',
  },
  'crypto.com': {
    domain: 'crypto.com',
    category: 'crypto',
    alias: 'Digital Finance',
  },
  'robinhood.com': {
    domain: 'robinhood.com',
    category: 'trading',
    alias: 'Investment Platform',
  },
  'webull.com': {
    domain: 'webull.com',
    category: 'trading',
    alias: 'Investment Platform',
  },

  // Dating - use generic social terms
  'tinder.com': {
    domain: 'tinder.com',
    category: 'dating',
    alias: 'Social Platform',
  },
  'bumble.com': {
    domain: 'bumble.com',
    category: 'dating',
    alias: 'Social Network',
  },
  'seeking.com': {
    domain: 'seeking.com',
    category: 'dating',
    alias: 'Premium Dating',
  },
  'adultfriendfinder.com': {
    domain: 'adultfriendfinder.com',
    category: 'dating',
    alias: 'Social Platform',
  },

  // High-interest lending - use generic finance terms
  'cashadvance.com': {
    domain: 'cashadvance.com',
    category: 'lending',
    alias: 'Financial Services',
  },
  'paydayloan.com': {
    domain: 'paydayloan.com',
    category: 'lending',
    alias: 'Financial Services',
  },
  'quickcash.com': {
    domain: 'quickcash.com',
    category: 'lending',
    alias: 'Financial Services',
  },
};

/**
 * Categorizes a domain and returns anti-cloaking safe information
 */
export async function categorizeDomain(url: string): Promise<DomainCategory> {
  const domain = extractDomain(url);

  if (!domain) {
    return { category: null, alias: null, kind: 'normal' };
  }

  // Check local cache first
  const localRecord = SENSITIVE_DOMAINS[domain];
  if (localRecord) {
    return {
      category: localRecord.category,
      alias: localRecord.alias,
      kind: 'sensitive',
    };
  }

  // Database lookup disabled - only use local cache
  return { category: null, alias: null, kind: 'normal' };
}

/**
 * Gets crawler-safe label for a domain
 */
export function getCrawlerSafeLabel(
  domain: string,
  fallback: string = 'External Link'
): string {
  const record = SENSITIVE_DOMAINS[domain.toLowerCase()];
  return record?.alias || fallback;
}

/**
 * Checks if a domain is considered sensitive
 */
export function isSensitiveDomain(url: string): boolean {
  const domain = extractDomain(url);
  return domain in SENSITIVE_DOMAINS;
}

/**
 * Gets category-specific crawler-safe descriptions
 */
export function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    adult: 'This link requires confirmation',
    gambling: 'This link leads to a gaming platform',
    crypto: 'This link leads to a financial platform',
    trading: 'This link leads to an investment platform',
    dating: 'This link leads to a social platform',
    lending: 'This link leads to financial services',
  };

  return descriptions[category] || 'This link requires confirmation';
}

/**
 * Gets all sensitive domains for administrative purposes
 */
export function getAllSensitiveDomains(): SensitiveDomainRecord[] {
  return Object.values(SENSITIVE_DOMAINS);
}

/**
 * Adds a new sensitive domain (for admin use)
 */
export async function addSensitiveDomain(
  domain: string,
  category: string,
  alias: string
): Promise<boolean> {
  // Adding sensitive domains to database is disabled
  // Consider implementing with alternative storage if needed
  console.log(
    `Would add sensitive domain: ${domain} -> ${category} (${alias})`
  );
  return false;
}

/**
 * Checks if URL contains sensitive keywords that should be avoided
 */
export function containsSensitiveKeywords(text: string): boolean {
  const sensitiveKeywords = [
    'porn',
    'adult',
    'xxx',
    'nsfw',
    'sex',
    'casino',
    'gambling',
    'bet',
    'crypto',
    'bitcoin',
    'ethereum',
    'trading',
    'forex',
    'loan',
    'cash advance',
  ];

  const lowerText = text.toLowerCase();
  return sensitiveKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Sanitizes text to be crawler-safe
 */
export function sanitizeForCrawlers(text: string): string {
  // Replace sensitive keywords with generic terms
  return text
    .replaceAll(/\b(porn|adult|xxx|nsfw|sex)\b/gi, 'content')
    .replaceAll(/\b(casino|gambling|bet)\b/gi, 'gaming')
    .replaceAll(/\b(crypto|bitcoin|ethereum)\b/gi, 'digital')
    .replaceAll(/\b(trading|forex)\b/gi, 'investment')
    .replaceAll(/\b(loan|cash advance)\b/gi, 'financial');
}
