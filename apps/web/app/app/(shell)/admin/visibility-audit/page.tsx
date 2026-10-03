import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { VisibilityAuditReportView } from '@/components/features/visibility-audit/VisibilityAuditReportView';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { assembleVisibilityAudit } from '@/lib/visibility-audit/assemble';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';

export const metadata: Metadata = {
  title: 'Visibility Audit',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';

export default async function AdminVisibilityAuditPage() {
  await requireCurrentAdminPageAccess();
  const report = assembleVisibilityAudit(TIM_WHITE_VISIBILITY_AUDIT_INPUT);
  return (
    <AdminPage
      title='Visibility Audit'
      testId='admin-visibility-audit-page'
      viewTestId='admin-visibility-audit-content'
    >
      <VisibilityAuditReportView report={report} />
    </AdminPage>
  );
}
