import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLocalDevelopmentAutomationHostname } from '@/lib/security/development-only';
import { AudioProofClient } from './AudioProofClient';
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

  const fixture = readFileSync(
    resolve(process.cwd(), 'tests/fixtures/audio/long-vbr-tone.mp3')
  );

  return (
    <AudioProofShell>
      <AudioProofClient
        audioSrc={`data:audio/mpeg;base64,${fixture.toString('base64')}`}
      >
        {children}
      </AudioProofClient>
    </AudioProofShell>
  );
}
