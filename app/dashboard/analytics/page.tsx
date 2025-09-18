import { DashboardAnalytics } from '@/components/dashboard/DashboardAnalytics';
import { getDashboardData } from '../actions';

export default async function AnalyticsPage() {
  // Fetch dashboard data server-side
  const dashboardData = await getDashboardData();

  // Pass server-fetched data to client component
  return <DashboardAnalytics initialData={dashboardData} />;
}
