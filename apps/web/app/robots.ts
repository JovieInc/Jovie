import { MetadataRoute } from 'next';
import { MARKETING_URL } from '@/constants/app';

// Multi-domain robots.txt configuration
// This serves from the marketing domain (meetjovie.com)
// Profile domain (jov.ie) will have its own robots.txt if needed

export default function robots(): MetadataRoute.Robots {
  // Define common rules once to avoid duplication
  const commonRules = {
    allow: ['/', '/blog', '/blog/', '/legal/privacy', '/legal/terms'],
    disallow: [
      '/investors',
      '/api/',
      '/dashboard/',
      '/admin/',
      '/_next/',
      '/private/',
      '/auth/',
      '/out/',
      '/*.json',
      '/*.xml',
    ],
    crawlDelay: 1,
  };

  // Array of user agents to apply the same rules to
  const userAgents = ['*', 'Googlebot', 'Bingbot', 'Slurp'];

  return {
    rules: userAgents.map(userAgent => ({
      userAgent,
      ...commonRules,
    })),
    sitemap: `${MARKETING_URL}/sitemap.xml`,
    host: MARKETING_URL,
  };
}
