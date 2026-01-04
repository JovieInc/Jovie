import { redirect } from 'next/navigation';

// This is the /app/dashboard entry point that redirects to the actual overview page
// This redirect is correct and should stay as /app/dashboard/overview
export default function DashboardPage() {
  redirect('/app/dashboard/overview');
}
