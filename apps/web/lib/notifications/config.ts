import { APP_NAME, APP_URL } from '@/constants/app';
import { TRANSACTIONAL_EMAIL_DOMAIN } from '@/constants/domains';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? APP_URL;

export const NOTIFICATIONS_BRAND_NAME = APP_NAME;
export const NOTIFICATIONS_APP_URL = appUrl;

// Transactional emails sent from notify.jov.ie subdomain
export const EMAIL_FROM_ADDRESS =
  env.RESEND_FROM_EMAIL || `notifications@${TRANSACTIONAL_EMAIL_DOMAIN}`;

// Reply-to goes to main domain (receiving address)
export const EMAIL_REPLY_TO = env.RESEND_REPLY_TO_EMAIL || 'support@jov.ie';
export const RESEND_ENABLED = Boolean(env.RESEND_API_KEY);
