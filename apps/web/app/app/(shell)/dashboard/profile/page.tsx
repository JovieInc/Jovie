import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Legacy profile page -- redirects to the unified chat experience.
 * The profile is now a right-drawer panel accessible from any chat route
 * via the sidebar profile button or the preview toggle.
 */
export default function ProfilePage() {
  redirect(`${APP_ROUTES.CHAT}?panel=profile`);
}
