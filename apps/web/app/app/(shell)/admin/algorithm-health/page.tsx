import type { Metadata } from 'next';
import {
  ALGORITHM_HEALTH_E2E_REPORT,
  AlgorithmHealthWorkspace,
} from '@/components/features/admin/algorithm-health/AlgorithmHealthWorkspace';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';

interface AlgorithmHealthPageProps {
  readonly searchParams: Promise<{
    fixture?: string | string[] | undefined;
  }>;
}

export const metadata: Metadata = {
  title: 'Algorithm Health',
};

export const runtime = 'nodejs';

export default async function AlgorithmHealthPage({
  searchParams,
}: Readonly<AlgorithmHealthPageProps>) {
  const params = await searchParams;
  const fixtureParam = Array.isArray(params.fixture)
    ? params.fixture[0]
    : params.fixture;

  return (
    <AdminToolPage
      title='Algorithm Health'
      description='Diagnose Spotify Fans Also Like positioning with a consistent admin shell.'
      testId='admin-algorithm-health-page'
    >
      <AlgorithmHealthWorkspace
        fixtureReport={
          fixtureParam === 'e2e' ? ALGORITHM_HEALTH_E2E_REPORT : null
        }
      />
    </AdminToolPage>
  );
}
