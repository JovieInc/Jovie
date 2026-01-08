import { redirect } from 'next/navigation';

// Redirect from legacy /app/settings/account to /app/settings
export default function AccountRedirect() {
  redirect('/app/settings');
}
