import { APP_NAME, APP_URL } from '@/constants/app';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? APP_URL;
const fallbackHostname = 'jov.ie';
const hostname = (() => {
  try {
    return new URL(appUrl).hostname || fallbackHostname;
  } catch {
    return fallbackHostname;
  }
})();

export const NOTIFICATIONS_BRAND_NAME = APP_NAME;
export const NOTIFICATIONS_APP_URL = appUrl;

export const EMAIL_FROM_ADDRESS =
  env.RESEND_FROM_EMAIL || `notifications@${hostname}`;

export const EMAIL_REPLY_TO = env.RESEND_REPLY_TO_EMAIL || undefined;
export const RESEND_ENABLED = Boolean(env.RESEND_API_KEY);
