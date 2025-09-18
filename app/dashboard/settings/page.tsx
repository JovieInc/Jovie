import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getDashboardData } from '../actions';

export default async function SettingsPage() {
  // Fetch dashboard data server-side
  const dashboardData = await getDashboardData();

  // Pass server-fetched data to client component
  return <DashboardSettings initialData={dashboardData} />;
}
