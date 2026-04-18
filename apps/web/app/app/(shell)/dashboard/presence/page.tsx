import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Presence page — redirects to artist profile settings (Music tab in the right drawer).
 * Suggested DSP matches are now shown inline in the profile sidebar.
 */
export default function PresencePage() {
  redirect(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`);
}
