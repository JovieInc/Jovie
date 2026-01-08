import { redirect } from 'next/navigation';

// Redirect from legacy /app/settings/remove-branding to /app/settings/branding
export default function RemoveBrandingRedirect() {
  redirect('/app/settings/branding');
}
