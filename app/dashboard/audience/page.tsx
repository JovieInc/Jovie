import { DashboardAudience } from '@/components/dashboard/DashboardAudience';
import { getDashboardData } from '../actions';

export default async function AudiencePage() {
  // Fetch dashboard data server-side
  const dashboardData = await getDashboardData();

  // Pass server-fetched data to client component
  return <DashboardAudience initialData={dashboardData} />;
}
