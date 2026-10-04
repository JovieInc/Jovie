import { APP_NAME } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { wordmarkGeometry } from '@/lib/brand/primitives';
import { Artist } from '@/types/db';

interface FooterOptions {
  artist: Artist;
  utmSource?: string;
}

/**
 * Generates footer HTML for use in server-side rendered pages like /listen
 * This provides footer HTML for server-side rendered pages
 * Hides branding for Pro plan users or if explicitly set in artist settings
 */
export async function generateFooterHTML({
  artist,
  utmSource = 'listen',
}: FooterOptions): Promise<string> {
  // Feature flags not needed; waitlist removed

  // The construction wordmark (JOV-7760); its o is the Jovie mark.
  const wordmark = wordmarkGeometry(24);
  const logoSvg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="${wordmark.viewBox}"
      class="h-6 w-auto text-gray-600 hover:text-gray-900 transition-colors"
      fill="currentColor"
      role="img"
      aria-label="${APP_NAME}"
    >${wordmark.glyphs.map(glyph => `<path d="${glyph.d}"/>`).join('')}</svg>
  `;

  const signUpLink = `/sign-up?utm_source=${utmSource}&utm_artist=${artist.handle}`;

  return `
    <footer class="mt-8 border-t border-gray-200 pt-6">
      <div class="flex flex-col items-center justify-center space-y-2">
        <a
          href="/?utm_source=${utmSource}&utm_artist=${artist.handle}"
          aria-label="Create your own profile with ${APP_NAME}"
          class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-sm"
        >
          ${logoSvg}
        </a>
        <a
          href="${signUpLink}"
          class="text-xs text-gray-500 hover:text-indigo-600 font-medium transition-colors"
        >
          Join the waitlist
        </a>

        <div class="mt-4 pt-4 border-t border-gray-100">
          <a
            href="${APP_ROUTES.LEGAL_PRIVACY}"
            class="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Privacy
          </a>
        </div>
      </div>
    </footer>
  `;
}
