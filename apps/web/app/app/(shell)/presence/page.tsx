import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Canonical presence alias. DSP matches now live in artist profile settings.
 */
export default function PresencePage() {
  redirect(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`);
}
