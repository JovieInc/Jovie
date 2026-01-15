import { APP_NAME, APP_URL } from '@/constants/app';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? APP_URL;

export const NOTIFICATIONS_BRAND_NAME = APP_NAME;
export const NOTIFICATIONS_APP_URL = appUrl;

// Email sender domain (notify.jov.ie for transactional emails)
export const EMAIL_FROM_ADDRESS =
  env.RESEND_FROM_EMAIL || 'notifications@notify.jov.ie';

// Support email addresses
export const SUPPORT_EMAIL = 'support@jov.ie';
export const LEGAL_EMAIL = 'legal@jov.ie';
export const PRIVACY_EMAIL = 'privacy@jov.ie';

export const EMAIL_REPLY_TO = env.RESEND_REPLY_TO_EMAIL || undefined;
export const RESEND_ENABLED = Boolean(env.RESEND_API_KEY);
