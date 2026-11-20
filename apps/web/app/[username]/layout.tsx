import { ProfileWebVitalsReporter } from '@/components/features/profile/ProfileWebVitalsReporter';
import { ClientProviders } from '@/components/providers/ClientProviders';

export default function ProfileLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Public profile pages are unauthenticated by design. Signed-out defaults
  // skip a live Better Auth session subscribe so anonymous visitors do not
  // wait on cookie-backed auth. Authenticated flows (sign-in, claim,
  // dashboard) mount JovieAuthValuesProvider under their own route groups.
  return (
    <ClientProviders forceSignedOutDefaults skipCoreProviders>
      {children}
      <ProfileWebVitalsReporter />
    </ClientProviders>
  );
}
