'use client';

import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';

interface NuqsProviderProps {
  children: ReactNode;
}

/**
 * NuqsProvider wraps the application to enable type-safe URL search params.
 *
 * This provider enables the nuqs library to work with Next.js App Router,
 * providing type-safe, reactive URL state management throughout the app.
 *
 * @see https://nuqs.dev/docs/adapters/next-app-router
 */
export function NuqsProvider({ children }: NuqsProviderProps) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
