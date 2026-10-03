import type { Metadata } from 'next';
import { VisibilityAuditReportView } from '@/components/features/visibility-audit/VisibilityAuditReportView';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { assembleVisibilityAudit } from '@/lib/visibility-audit/assemble';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';

export const metadata: Metadata = {
  title: 'Visibility audit',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';

export default async function AdminVisibilityAuditPage() {
  await requireCurrentAdminPageAccess();
  const report = assembleVisibilityAudit(TIM_WHITE_VISIBILITY_AUDIT_INPUT);
  return (
    <div data-route={APP_ROUTES.ADMIN_VISIBILITY_AUDIT}>
      <VisibilityAuditReportView report={report} />
    </div>
  );
}
