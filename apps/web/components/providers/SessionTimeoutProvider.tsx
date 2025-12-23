'use client';

import React from 'react';
import { SessionTimeoutDialog } from '@/components/organisms/SessionTimeoutDialog';
import {
  SessionTimeoutContext,
  useProvideSessionTimeout,
} from '@/lib/hooks/useSessionTimeout';

interface SessionTimeoutProviderProps {
  children: React.ReactNode;
}

export function SessionTimeoutProvider({
  children,
}: SessionTimeoutProviderProps) {
  const value = useProvideSessionTimeout();

  return (
    <SessionTimeoutContext.Provider value={value}>
      {children}
      <SessionTimeoutDialog />
    </SessionTimeoutContext.Provider>
  );
}
