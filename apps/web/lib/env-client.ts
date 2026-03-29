'use client';

function isRuntimeE2EMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.documentElement.dataset.e2eMode === '1';
}

export const env = {
  get NODE_ENV() {
    return process.env.NODE_ENV ?? 'development';
  },
  get IS_DEV() {
    return (process.env.NODE_ENV ?? 'development') === 'development';
  },
  get IS_TEST() {
    return process.env.NODE_ENV === 'test';
  },
  get IS_E2E() {
    return (
      process.env.NEXT_PUBLIC_E2E_MODE === '1' ||
      process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
      isRuntimeE2EMode()
    );
  },
} as const;
