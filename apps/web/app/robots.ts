import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { MARKETING_URL, PROFILE_URL } from '@/constants/app';
import { PROFILE_HOSTNAME } from '@/constants/domains';

// Multi-domain robots.txt configuration
// Serves different robots.txt based on the requesting domain:
// - jov.ie: Allow profile indexing
// - meetjovie.com: Marketing + app with restricted paths

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  const isProfileDomain =
    host === PROFILE_HOSTNAME || host === `www.${PROFILE_HOSTNAME}`;

  if (isProfileDomain) {
    // jov.ie robots - allow profile indexing
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/api/', '/out/'],
        },
      ],
      sitemap: `${PROFILE_URL}/sitemap.xml`,
      host: PROFILE_URL,
    };
  }

  // meetjovie.com robots - marketing + app
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/', '/legal/privacy', '/legal/terms'],
        disallow: [
          '/api/',
          '/app/',
          '/dashboard/',
          '/admin/',
          '/_next/',
          '/private/',
          '/auth/',
          '/out/',
          '/investors',
        ],
      },
    ],
    sitemap: `${MARKETING_URL}/sitemap.xml`,
    host: MARKETING_URL,
  };
}
