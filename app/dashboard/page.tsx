import { redirect } from 'next/navigation';

export default function DashboardPage() {
  // Redirect to overview as the default dashboard page
  redirect('/dashboard/overview');
}
