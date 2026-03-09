import type { Metadata } from 'next';
import { DemoReleasesExperience } from '@/components/demo/DemoReleasesExperience';
import { buildDemoDashboardData } from '@/components/demo/mock-dashboard-data';
import { getDemoCreator } from '@/lib/demo-creator';

export const metadata: Metadata = {
  title: 'Jovie Demo',
  description:
    'See Jovie in action with a live product demo. Explore releases, audience insights, and analytics — no sign-up required.',
};

export const revalidate = 3600; // 1 hour — pulls featured creator from DB cache

export default async function DemoPage() {
  const creator = await getDemoCreator();
  const dashboardData = buildDemoDashboardData(creator);

  return <DemoReleasesExperience dashboardData={dashboardData} />;
}
