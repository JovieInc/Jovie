import { redirect } from 'next/navigation';

// Redirect from legacy /app/dashboard/overview to /app/dashboard
export default function OverviewRedirect() {
  redirect('/app/dashboard');
}
