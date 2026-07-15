import 'server-only';

import { createTwilioVerifyAdapter } from '@/lib/notifications/providers/sms/twilio-verify';

/** Vendor-neutral boundary used by the shared identity service. */
export interface PhoneVerificationPort {
  start(phoneNumber: string): Promise<void>;
  check(phoneNumber: string, code: string): Promise<boolean>;
}

export const phoneVerification: PhoneVerificationPort =
  createTwilioVerifyAdapter();
