'use client';

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  IS_DEV: (process.env.NODE_ENV ?? 'development') === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',
  IS_E2E: process.env.NEXT_PUBLIC_E2E_MODE === '1',
} as const;
