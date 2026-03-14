import { APP_NAME, APP_URL } from '@/constants/app';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import {
  SYSTEM_FROM_EMAIL,
  SYSTEM_REPLY_TO_EMAIL,
} from '@/lib/notifications/sender-policy';

const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? APP_URL;

export const NOTIFICATIONS_BRAND_NAME = APP_NAME;
export const NOTIFICATIONS_APP_URL = appUrl;

// System sender for transactional/notification emails
export const EMAIL_FROM_ADDRESS = SYSTEM_FROM_EMAIL;

// Support email addresses
export const SUPPORT_EMAIL = 'support@jov.ie';
export const LEGAL_EMAIL = 'legal@jov.ie';
export const PRIVACY_EMAIL = 'privacy@jov.ie';

export const EMAIL_REPLY_TO = SYSTEM_REPLY_TO_EMAIL;
export const RESEND_ENABLED = Boolean(env.RESEND_API_KEY);
