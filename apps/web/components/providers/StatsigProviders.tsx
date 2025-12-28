'use client';

import React from 'react';
import { MyStatsig } from '@/app/my-statsig';
import type { StatsigBootstrapData } from '@/lib/statsig/types';

export interface StatsigProvidersProps {
  children: React.ReactNode;
  userId?: string;
  /**
   * Optional pre-fetched bootstrap data from server for instant initialization.
   * When provided, Statsig initializes synchronously without a network request.
   * Falls back to async initialization if not provided.
   */
  bootstrapData?: StatsigBootstrapData | null;
}

export function StatsigProviders({
  children,
  userId,
  bootstrapData,
}: StatsigProvidersProps) {
  return (
    <MyStatsig userId={userId} bootstrapData={bootstrapData}>
      {children}
    </MyStatsig>
  );
}
