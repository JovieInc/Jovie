import { redirect } from 'next/navigation';

/**
 * Deprecated product-screen compatibility route.
 *
 * Keep the static destination available for the sweep/ingestion path until
 * usage reaches zero; new Taste Inbox decisions belong in canonical Ops at
 * /app/admin/ops and /api/admin/hud/taste-inbox.
 */
export default function TasteInboxPage() {
  redirect('/taste-inbox/index.html');
}
