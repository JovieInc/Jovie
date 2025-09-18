import { DashboardOverview } from '@/components/dashboard/organisms/DashboardOverview';
import { getDashboardData } from '../actions';

export default async function OverviewPage() {
  // Fetch dashboard data server-side
  const dashboardData = await getDashboardData();

  // Pass server-fetched data to client component
  return <DashboardOverview initialData={dashboardData} />;
}
