'use client';

// Common domain typos and their corrections
const DOMAIN_CORRECTIONS: Record<string, string> = {
  // Social Media
  'instgaram.com': 'instagram.com',
  'instagram.co': 'instagram.com',
  'instagra.com': 'instagram.com',
  'instagramm.com': 'instagram.com',
  'youtub.com': 'youtube.com',
  youtubecom: 'youtube.com',
  'youtube.co': 'youtube.com',
  'youtubee.com': 'youtube.com',
  'tiktok.co': 'tiktok.com',
  tiktokcom: 'tiktok.com',
  'tiktok.app': 'tiktok.com',
  tiktokkcom: 'tiktok.com',
  'twitter.co': 'twitter.com',
  twittercom: 'twitter.com',
  'twiter.com': 'twitter.com',
  'x.co': 'x.com',
  xcom: 'x.com',
  'facebook.co': 'facebook.com',
  facebookcom: 'facebook.com',
  'facbook.com': 'facebook.com',
  'linkedin.co': 'linkedin.com',
  linkedincom: 'linkedin.com',
  'linkdin.com': 'linkedin.com',
  'snapchat.co': 'snapchat.com',
  snapchatcom: 'snapchat.com',
  'snapcht.com': 'snapchat.com',

  // Music Platforms
  'spotify.co': 'spotify.com',
  spotifycom: 'spotify.com',
  'spotfiy.com': 'spotify.com',
  'spotiy.com': 'spotify.com',
  'apple.co': 'apple.com',
  applecom: 'apple.com',
  'appl.com': 'apple.com',
  'soundcloud.co': 'soundcloud.com',
  soundcloudcom: 'soundcloud.com',
  'soudcloud.com': 'soundcloud.com',
  'bandcamp.co': 'bandcamp.com',
  bandcampcom: 'bandcamp.com',
  'bandcam.com': 'bandcamp.com',

  // Payment/Commerce
  'paypal.co': 'paypal.com',
  paypalcom: 'paypal.com',
  'payp.com': 'paypal.com',
  'venmo.co': 'venmo.com',
  venmocom: 'venmo.com',
  'vnmo.com': 'venmo.com',
  'cashapp.co': 'cash.app',
  cashappcom: 'cash.app',
  'cash.com': 'cash.app',
  'patreon.co': 'patreon.com',
  patreoncom: 'patreon.com',
  'patreon.app': 'patreon.com',

  // Common website typos
  gmailcom: 'gmail.com',
  'gmail.co': 'gmail.com',
  githubcom: 'github.com',
  'github.co': 'github.com',
  googlecom: 'google.com',
  'google.co': 'google.com',
};

// Common URL patterns that need protocol/format fixes
const URL_PATTERNS = [
  // Missing dots in domain
  {
    pattern: /^([a-zA-Z0-9-]+)(com|org|net|io|co|app)$/,
    fix: (match: string) => {
      const parts = match.match(/^([a-zA-Z0-9-]+)(com|org|net|io|co|app)$/);
      if (parts) {
        return `${parts[1]}.${parts[2]}`;
      }
      return match;
    },
  },
  // Social handles without @
  {
    pattern: /^@?([a-zA-Z0-9._-]+)$/,
    fix: (match: string) => {
      // Only suggest social platforms if it looks like a username
      if (
        match.length > 2 &&
        match.length < 31 &&
        /^@?[a-zA-Z0-9._-]+$/.test(match)
      ) {
        return null; // Return null to trigger platform suggestions
      }
      return match;
    },
  },
];

export interface URLSuggestion {
  type: 'typo-fix' | 'format-fix' | 'platform-suggestion';
  original: string;
  suggested: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  platform?: string;
}

// Calculate string similarity using Levenshtein distance
function similarity(str1: string, str2: string): number {
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[len2][len1];
  const maxLength = Math.max(len1, len2);
  return (maxLength - distance) / maxLength;
}

// Find the best domain correction
function findDomainCorrection(domain: string): URLSuggestion | null {
  const lowerDomain = domain.toLowerCase();

  // Direct match
  if (DOMAIN_CORRECTIONS[lowerDomain]) {
    return {
      type: 'typo-fix',
      original: domain,
      suggested: DOMAIN_CORRECTIONS[lowerDomain],
      confidence: 'high',
      reason: 'Common typo correction',
    };
  }

  // Fuzzy matching for close typos
  let bestMatch: { domain: string; score: number } | null = null;

  for (const [typo, correct] of Object.entries(DOMAIN_CORRECTIONS)) {
    const score = similarity(lowerDomain, typo);
    if (score > 0.8 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { domain: correct, score };
    }
  }

  if (bestMatch && bestMatch.score > 0.85) {
    return {
      type: 'typo-fix',
      original: domain,
      suggested: bestMatch.domain,
      confidence: bestMatch.score > 0.9 ? 'high' : 'medium',
      reason: 'Similar to common domain',
    };
  }

  return null;
}

// Handle format fixes (missing dots, protocols, etc.)
function findFormatFix(input: string): URLSuggestion | null {
  const trimmed = input.trim();

  for (const pattern of URL_PATTERNS) {
    if (pattern.pattern.test(trimmed)) {
      const fixed = pattern.fix(trimmed);

      if (fixed && fixed !== trimmed) {
        return {
          type: 'format-fix',
          original: input,
          suggested: fixed,
          confidence: 'high',
          reason: 'Added missing punctuation',
        };
      }
    }
  }

  return null;
}

// Generate platform suggestions for usernames
function generatePlatformSuggestions(username: string): URLSuggestion[] {
  const cleanUsername = username.replace(/^@/, '');

  // Only suggest for reasonable usernames
  if (cleanUsername.length < 2 || cleanUsername.length > 30) {
    return [];
  }

  const platformSuggestions = [
    {
      platform: 'instagram',
      url: `instagram.com/${cleanUsername}`,
      confidence: 'high' as const,
    },
    {
      platform: 'twitter',
      url: `x.com/${cleanUsername}`,
      confidence: 'high' as const,
    },
    {
      platform: 'tiktok',
      url: `tiktok.com/@${cleanUsername}`,
      confidence: 'medium' as const,
    },
    {
      platform: 'youtube',
      url: `youtube.com/@${cleanUsername}`,
      confidence: 'medium' as const,
    },
    {
      platform: 'linkedin',
      url: `linkedin.com/in/${cleanUsername}`,
      confidence: 'medium' as const,
    },
  ];

  return platformSuggestions.map(({ platform, url, confidence }) => ({
    type: 'platform-suggestion' as const,
    original: username,
    suggested: url,
    confidence,
    reason: `${platform.charAt(0).toUpperCase() + platform.slice(1)} profile`,
    platform,
  }));
}

// Main function to get smart URL suggestions
export function getSmartURLSuggestions(input: string): URLSuggestion[] {
  if (!input.trim()) return [];

  const suggestions: URLSuggestion[] = [];
  const trimmed = input.trim();

  // Check for format fixes first
  const formatFix = findFormatFix(trimmed);
  if (formatFix) {
    suggestions.push(formatFix);

    // Also check if the fixed version has domain corrections
    const domainFix = findDomainCorrection(formatFix.suggested);
    if (domainFix) {
      suggestions.push({
        ...domainFix,
        original: input,
        suggested: domainFix.suggested,
      });
    }
  }

  // Check for domain corrections on the original input
  if (!formatFix) {
    const domainFix = findDomainCorrection(trimmed);
    if (domainFix) {
      suggestions.push(domainFix);
    }
  }

  // Check if it looks like a username/handle
  if (/^@?[a-zA-Z0-9._-]+$/.test(trimmed) && !trimmed.includes('.')) {
    const platformSuggestions = generatePlatformSuggestions(trimmed);
    suggestions.push(...platformSuggestions.slice(0, 3)); // Limit to top 3
  }

  return suggestions;
}

// Get the best auto-correction (highest confidence suggestion)
export function getAutoCorrection(input: string): URLSuggestion | null {
  const suggestions = getSmartURLSuggestions(input);

  // Only auto-correct high confidence typo fixes and format fixes
  const autoCorrectableSuggestions = suggestions.filter(
    s =>
      (s.type === 'typo-fix' || s.type === 'format-fix') &&
      s.confidence === 'high'
  );

  return autoCorrectableSuggestions[0] || null;
}
