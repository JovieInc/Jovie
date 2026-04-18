import { UnavailablePage } from '@/components/UnavailablePage';

export const runtime = 'nodejs';

/**
 * Page target for middleware rewrite on non-/app paths.
 * The URL bar stays on the user's original path — this page
 * is never directly navigated to by users.
 */
export default function UnavailableRoute() {
  return <UnavailablePage />;
}
