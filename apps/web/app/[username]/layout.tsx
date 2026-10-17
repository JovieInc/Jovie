import { ProfileWebVitalsReporter } from '@/components/features/profile/ProfileWebVitalsReporter';
import { ClientProviders } from '@/components/providers/ClientProviders';

// A cached public body must never bypass current publication/element policy.
// Keep anonymous rendering per-request; data readers may separately cache facts
// only after an authoritative access decision. Previously received client data
// cannot be revoked by a later setting.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
