'use client';

import * as SignIn from '@clerk/elements/sign-in';
import { useEffect } from 'react';

const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

export default function SignInSsoCallbackPage() {
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
    <SignIn.Root routing='path' path='/signin'>
      <SignIn.Step name='sso-callback'>
        <SignIn.Captcha />
      </SignIn.Step>
    </SignIn.Root>
  );
}
