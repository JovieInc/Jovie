import { redirect } from 'next/navigation';

// Redirect from legacy /app/dashboard/tipping to /app/dashboard/earnings
export default function TippingRedirect() {
  redirect('/app/dashboard/earnings');
}
