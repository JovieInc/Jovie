import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: any route that sends or verifies an email OTP through the shared
 * otp-service must use the shared OTP limiters. Requesting a code resets the
 * per-code attempt cap, so an unlimited request route means unlimited guesses.
 */
const API_ROOT = join(__dirname, '../../../app/api');

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

describe('email OTP routes use the shared limiters', () => {
  const otpRoutes = routeFiles(API_ROOT).filter(file =>
    /from '@\/lib\/notifications\/otp-service'/.test(readFileSync(file, 'utf8'))
  );

  it('finds the promo OTP routes', () => {
    expect(otpRoutes.length).toBeGreaterThanOrEqual(2);
  });

  it.each(otpRoutes)('%s', file => {
    expect(readFileSync(file, 'utf8')).toContain(
      '@/lib/notifications/email-otp-limiters'
    );
  });
});
