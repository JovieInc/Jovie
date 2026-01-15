import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { PROFILE_URL } from '@/constants/app';
import { APP_HOSTNAME, PROFILE_HOSTNAME } from '@/constants/domains';

// Multi-domain robots.txt configuration
// Serves different robots.txt based on the requesting domain:
// - jov.ie: Marketing homepage + profile indexing
// - app.jov.ie: Block ALL indexing (authenticated app)
// - meetjovie.com: 301 redirects (handled in middleware)

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  const isAppSubdomain =
    host === APP_HOSTNAME || host === 'app.jov.ie' || host.startsWith('app.');

  // app.jov.ie - block ALL indexing
  if (isAppSubdomain) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: '/', // Block entire app subdomain
        },
      ],
    };
  }

  const isProfileDomain =
    host === PROFILE_HOSTNAME || host === `www.${PROFILE_HOSTNAME}`;

  // jov.ie - marketing + profiles
  if (isProfileDomain) {
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

  // Default/fallback - block indexing
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}
