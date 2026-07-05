import { buildGoogleConsentInitScript } from '@/lib/tracking/google-consent-mode';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildGoogleConsentInitScript(), {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'text/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
