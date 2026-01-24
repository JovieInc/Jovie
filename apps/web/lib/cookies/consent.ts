'use server';

import { cookies } from 'next/headers';
import { isSecureEnv } from '@/lib/env-server';

export type Consent = {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
};

const COOKIE_NAME = 'jv_cc';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function readConsent(): Promise<Consent | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Consent;
  } catch {
    return null;
  }
}

export async function saveConsent(consent: Consent): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(consent), {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}
