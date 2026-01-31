'use client';

import type React from 'react';

export interface ClerkAppProviderProps {
  readonly children: React.ReactNode;
}

// Legacy stub: Root-level ClerkProvider is now applied in app/layout.tsx.
// This component remains only to satisfy older imports and simply renders children.
export function ClerkAppProvider({ children }: ClerkAppProviderProps) {
  return <>{children}</>;
}
