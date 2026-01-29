'use client';

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  IS_DEV: (process.env.NODE_ENV ?? 'development') === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',
} as const;
