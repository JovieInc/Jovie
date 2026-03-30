import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Insights page — redirects to audience page.
 *
 * The dedicated insights page has been replaced by the Signals card
 * in the audience analytics sidebar. This redirect catches stale
 * bookmarks and deep links.
 */
export default function InsightsPage() {
  redirect(APP_ROUTES.DASHBOARD_AUDIENCE);
}
