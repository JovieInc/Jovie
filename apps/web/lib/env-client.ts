'use client';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  NODE_ENV: nodeEnv,
  IS_DEV: nodeEnv === 'development',
  IS_TEST: nodeEnv === 'test',
} as const;
