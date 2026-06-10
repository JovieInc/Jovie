'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { LibraryShareDropPublicView } from '@/lib/library-share/types';
import { LibraryShareAssetLayouts } from './LibraryShareAssetLayouts';
import { LibraryShareDropHeader } from './LibraryShareDropHeader';
import { LibrarySharePassphraseGate } from './LibrarySharePassphraseGate';

interface LibraryShareDropSurfaceProps {
  readonly view: LibraryShareDropPublicView;
  readonly initialUnlocked: boolean;
}

export function LibraryShareDropSurface({
  view,
  initialUnlocked,
}: LibraryShareDropSurfaceProps) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(
    initialUnlocked || !view.requiresPassphrase
  );

  const handleUnlock = useCallback(
    async (passphrase: string) => {
      const response = await fetch(
        `/api/library/share-drops/${view.token}/unlock`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passphrase }),
        }
      );

      if (!response.ok) return false;

      setUnlocked(true);
      router.refresh();
      return true;
    },
    [router, view.token]
  );

  if (view.isExpired) {
    return (
      <div
        className='mx-auto max-w-lg px-4 py-24 text-center'
        data-testid='library-share-expired'
      >
        <h1 className='text-2xl font-semibold text-primary-token'>
          This drop has expired
        </h1>
        <p className='mt-3 text-sm text-secondary-token'>
          Ask {view.artistName} for a fresh link.
        </p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <LibrarySharePassphraseGate
        title={view.title}
        artistName={view.artistName}
        onUnlock={handleUnlock}
      />
    );
  }

  return (
    <div data-testid='library-share-drop-surface'>
      <LibraryShareDropHeader view={view} />
      <div className='mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8'>
        <LibraryShareAssetLayouts
          assets={view.assets}
          layout={view.layout}
          downloadsEnabled={view.downloadsEnabled}
        />
        <footer className='mt-10 border-t border-subtle pt-6 text-center text-xs text-tertiary-token'>
          Shared with Jovie · Press kit / label review
        </footer>
      </div>
    </div>
  );
}
