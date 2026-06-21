import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const AUTH_SHELL_SOURCE = join(
  process.cwd(),
  'components',
  'features',
  'auth',
  'AuthShell.tsx'
);

const CLERK_CAPTCHA_MOUNT_SOURCE = join(
  process.cwd(),
  'components',
  'features',
  'auth',
  'ClerkCaptchaMount.tsx'
);

describe('auth clerk captcha contract', () => {
  it('keeps the invisible Smart CAPTCHA mount in AuthShell', () => {
    const authShell = readFileSync(AUTH_SHELL_SOURCE, 'utf8');
    const captchaMount = readFileSync(CLERK_CAPTCHA_MOUNT_SOURCE, 'utf8');

    expect(authShell).toContain('ClerkCaptchaMount');
    expect(captchaMount).toContain("id='clerk-captcha'");
    expect(captchaMount).toContain("data-cl-size='invisible'");
    expect(captchaMount).toContain("data-cl-theme='dark'");
  });

  it('routes bot protection errors through parseClerkError in the email-code form', () => {
    const emailForm = readFileSync(
      join(
        process.cwd(),
        'components',
        'features',
        'auth',
        'EmailCodeAuthForm.tsx'
      ),
      'utf8'
    );

    expect(emailForm).toContain('parseClerkError');
    expect(emailForm).toContain('isBotProtectionError');
  });
});
