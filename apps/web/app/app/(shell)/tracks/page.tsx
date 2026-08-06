import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Tracks folded into the Library as the Table view mode (JOV-4846). Land on
 * the audio asset tab with table mode preselected — the closest production
 * equivalent of the retired Tracks catalog.
 */
export default async function TracksPage() {
  redirect(`${APP_ROUTES.LIBRARY}?view=audio&mode=table`);
}
