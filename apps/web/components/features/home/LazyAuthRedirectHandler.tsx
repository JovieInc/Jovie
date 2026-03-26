'use client';

import dynamic from 'next/dynamic';

const AuthRedirectHandler = dynamic(
  () =>
    import('./AuthRedirectHandler').then(mod => ({
      default: mod.AuthRedirectHandler,
    })),
  {
    ssr: false,
    loading: () => null,
  }
);

export function LazyAuthRedirectHandler() {
  return <AuthRedirectHandler />;
}
