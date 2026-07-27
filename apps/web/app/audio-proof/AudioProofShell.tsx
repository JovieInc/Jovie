'use client';

import type { ReactNode } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { PersistentAudioBar } from '@/components/organisms/PersistentAudioBar';

export function AudioProofShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <AppShellFrame
      sidebar={
        <aside className='hidden h-full w-61 items-center px-4 text-xs text-tertiary-token lg:flex'>
          Audio proof
        </aside>
      }
      header={
        <header className='flex h-12 shrink-0 items-center border-b border-subtle px-4 text-app font-caption text-primary-token'>
          Production Audio Shell
        </header>
      }
      main={children}
      audioPlayer={<PersistentAudioBar />}
    />
  );
}
