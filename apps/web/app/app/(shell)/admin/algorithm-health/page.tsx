import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminPeopleHref } from '@/constants/admin-navigation';

interface AlgorithmHealthPageProps {
  readonly searchParams: Promise<{
    fixture?: string | string[];
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
  const nextParams = new URLSearchParams();

  const fixtureParam = Array.isArray(params.fixture)
    ? params.fixture[0]
    : params.fixture;
  if (fixtureParam) {
    nextParams.set('legacyAlgorithmHealth', fixtureParam);
  }

  redirect(buildAdminPeopleHref('creators', nextParams));
}
