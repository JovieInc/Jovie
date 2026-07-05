/**
 * Mount point for Clerk Smart CAPTCHA on custom auth flows.
 *
 * Clerk requires `#clerk-captcha` in the DOM before sign-up/sign-in API calls
 * when Attack Protection → Bot sign-up protection is enabled. Invisible mode
 * runs the challenge without showing a widget to real users.
 *
 * @see https://clerk.com/docs/custom-flows/bot-sign-up-protection
 */
export function ClerkCaptchaMount() {
  return (
    <div
      id='clerk-captcha'
      data-cl-size='invisible'
      data-cl-theme='dark'
      data-auth-clerk-captcha
      aria-hidden='true'
    />
  );
}
