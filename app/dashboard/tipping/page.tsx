import { DashboardTipping } from '@/components/dashboard/DashboardTipping';
import { getDashboardData } from '../actions';

export default async function TippingPage() {
  // Fetch dashboard data server-side
  const dashboardData = await getDashboardData();

  // Pass server-fetched data to client component
  return <DashboardTipping initialData={dashboardData} />;
}
