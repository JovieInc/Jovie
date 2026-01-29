'use client';

import React from 'react';

export interface MyStatsigProps {
  children: React.ReactNode;
  userId?: string | null;
}

/**
 * Temporary placeholder while Statsig is disabled.
 * Simply renders children without additional providers.
 */
export function MyStatsig({ children }: MyStatsigProps) {
  return <>{children}</>;
}
