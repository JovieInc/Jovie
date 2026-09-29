import { ovieAdminReadRoute } from '@/lib/ovie/admin-read';
import { readCertificationMetrics } from '@/lib/ovie/certifications/metrics.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Certification v2 section 8 metrics, computed from the same stores as
 * `GET /api/ovie/certifications` (packet files, decision ledger, Summer
 * cards). Admin-only and never cached; metrics with no data report `null`
 * rather than zero.
 */
export const GET = ovieAdminReadRoute(
  'certification_metrics_unavailable',
  readCertificationMetrics
);
