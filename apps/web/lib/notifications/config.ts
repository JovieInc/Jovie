import { APP_NAME, APP_URL } from '@/constants/app';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

export {
  SYSTEM_FROM_EMAIL as EMAIL_FROM_ADDRESS,
  SYSTEM_REPLY_TO_EMAIL as EMAIL_REPLY_TO,
} from '@/lib/notifications/sender-policy';

const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? APP_URL;

export const NOTIFICATIONS_BRAND_NAME = APP_NAME;
export const NOTIFICATIONS_APP_URL = appUrl;

// Support email addresses
export const SUPPORT_EMAIL = 'support@jov.ie';
export const LEGAL_EMAIL = 'legal@jov.ie';
export const PRIVACY_EMAIL = 'privacy@jov.ie';

export const RESEND_ENABLED = Boolean(env.RESEND_API_KEY);
