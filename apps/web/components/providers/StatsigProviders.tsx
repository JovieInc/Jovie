'use client';

import React from 'react';
import { MyStatsig } from '@/app/my-statsig';

export interface StatsigProvidersProps {
  children: React.ReactNode;
  userId?: string;
}

export function StatsigProviders({ children, userId }: StatsigProvidersProps) {
  return <MyStatsig userId={userId}>{children}</MyStatsig>;
}
