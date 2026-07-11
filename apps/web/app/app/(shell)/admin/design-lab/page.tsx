import type { Metadata } from 'next';
import { DesignProposalReviewPanel } from '@/components/features/admin/design-lab';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';

export const metadata: Metadata = { title: 'Design Lab | Admin' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function AdminDesignLabPage() {
  return (
    <AdminPage
      title='Design Lab'
      description='Review missing section patterns, wireframes, feedback, and registry conversion evidence.'
      testId='admin-design-lab-page'
    >
      <DesignProposalReviewPanel kind='section-gap' />
    </AdminPage>
  );
}
