'use client';

import dynamic from 'next/dynamic';

// The idle dock has no server markup. Keep its client-only transport UI out
// of every route's initial shell bundle, while mounting it once for the shell.
// Server layouts import this wrapper; importing PersistentAudioBar directly
// from a server component ships the whole player in initial JS.
export const PersistentAudioBarLazy = dynamic(
  () =>
    import('@/components/organisms/PersistentAudioBar').then(
      module => module.PersistentAudioBar
    ),
  { ssr: false }
);
