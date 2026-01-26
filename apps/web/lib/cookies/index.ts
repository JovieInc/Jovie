import { cookies } from 'next/headers';
import { LISTEN_COOKIE } from '@/constants/app';
import { isSecureEnv } from '@/lib/env-server';

export async function getListenPreference(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(LISTEN_COOKIE)?.value;
}

export async function setListenPreference(value: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LISTEN_COOKIE, value, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: false,
    secure: isSecureEnv(),
    sameSite: 'lax',
  });
}
