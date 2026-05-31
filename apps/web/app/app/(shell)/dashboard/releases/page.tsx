import { ReleasesRoute } from '../../releases/ReleasesRoute';

export const runtime = 'nodejs';

/**
 * Dashboard releases page — thin delegate to shared ReleasesRoute.
 * Shell chrome (billing, chat conv, version checks) stays mounted across
 * transitions; query cache presets with refetchOnMount:false prevent dups (JOV-2201).
 */
export default async function ReleasesPage() {
  // Shell chrome (billing/chat/version queries) deduped via stable keys +
  // refetchOnMount:false + persistent mount (JOV-2201).
  return <ReleasesRoute />;
}
