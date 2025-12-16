'use client';

import * as SignUp from '@clerk/elements/sign-up';
import { useEffect } from 'react';

const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

export default function SignUpSsoCallbackPage() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const existingRedirectUrl = url.searchParams.get('redirect_url');
      if (existingRedirectUrl) return;

      const stored = window.sessionStorage.getItem(
        AUTH_REDIRECT_URL_STORAGE_KEY
      );
      if (stored && stored.startsWith('/') && !stored.startsWith('//')) {
        url.searchParams.set('redirect_url', stored);
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }, []);

  return (
    <SignUp.Root routing='path' path='/signup'>
      {null}
    </SignUp.Root>
  );
}
