'use client';

import type { Consent } from './consent';

const COOKIE_NAME = 'jv_cc';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function saveConsentClient(consent: Consent): Promise<void> {
  if (typeof document === 'undefined') return;

  const value = JSON.stringify(consent);
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';

  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}
