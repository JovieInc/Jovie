import { normalizeEmail } from '@/lib/utils/email';

/**
 * Platform listing review identity (JOV-9688).
 *
 * One source of truth for the account used to record the ChatGPT review
 * walkthrough and to walk a reviewer through the agent claim handoff. It
 * lives on jov.ie, a domain Jovie controls, and it carries the
 * `+clerk_test` tag so `isInternalOrTestAccountEmail` classifies it internal:
 * nothing the review account does reaches customer metrics. The address is
 * signed up once through the normal email-code flow by a human (Tim); the
 * one-time codes stay in Jovie's inbox and the credentials never enter git
 * or a plugin ZIP. The address is deliberately NOT a prodcert canary: the
 * production golden-path OTP reader and passage token refuse it, so a
 * listing review can never be mistaken for a certification run.
 */
export const CHATGPT_REVIEW_ACCOUNT_EMAIL = 'chatgpt-review+clerk_test@jov.ie';

export function isChatGPTReviewAccountEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  return normalizeEmail(email) === CHATGPT_REVIEW_ACCOUNT_EMAIL;
}
