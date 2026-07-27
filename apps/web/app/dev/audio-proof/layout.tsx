import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLocalDevelopmentAutomationHostname } from '@/lib/security/development-only';
import { AudioProofShell } from './AudioProofShell';

export default async function AudioProofLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const headerStore = await headers();
  const forwardedHost =
    headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  let hostname: string | null = null;
  try {
    hostname = forwardedHost
      ? new URL(`http://${forwardedHost.split(',')[0]?.trim()}`).hostname
      : null;
  } catch {
    hostname = null;
  }
  if (
    process.env.NEXT_PUBLIC_E2E_MODE !== '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    !isLocalDevelopmentAutomationHostname(hostname)
  ) {
    notFound();
  }

  return <AudioProofShell>{children}</AudioProofShell>;
}
