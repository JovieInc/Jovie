'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { LibraryLoadingState } from './LibraryLoadingState';
import type { LibrarySurface as LibrarySurfaceComponent } from './LibrarySurface';

type LibrarySurfaceProps = ComponentProps<typeof LibrarySurfaceComponent>;

/**
 * LibrarySurface in its own chunk. LibrarySurface is the largest client module
 * on /app/library (and /app/releases, which redirects there). Imported
 * statically, a cold load evaluates and hydrates it inside the shell's one
 * blocking hydration task, the frozen frame the product crawl flags. Behind
 * next/dynamic the server still renders it, and the client evaluates and
 * hydrates it in a later task. The skeleton only shows on a client navigation
 * that beats the chunk.
 */
export const LibrarySurface = dynamic<LibrarySurfaceProps>(
  () => import('./LibrarySurface').then(module => module.LibrarySurface),
  { loading: () => <LibraryLoadingState /> }
);
