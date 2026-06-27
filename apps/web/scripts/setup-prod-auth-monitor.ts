/**
 * Provision the production "auth monitor" Clerk user.
 *
 * One-time (idempotent) setup for the real-session auth monitor: a single
 * dedicated user whose only purpose is to let a synthetic check mint a Clerk
 * `sign_in_token`, exchange it in a real browser, and assert an authenticated
 * session loads on production. No password is ever set (token-only), so no
 * credential is stored anywhere.
 *
 * Run once per instance:
 *   doppler run --project jovie-web --config prd -- \
 *     pnpm tsx apps/web/scripts/setup-prod-auth-monitor.ts --confirm
 *
 * Costs exactly one MAU. The user is tagged { role: 'auth-monitor' } so it can
 * be excluded from analytics/billing reports and cleaned up deterministically.
 */
import { createClerkClient } from '@clerk/backend';

const EMAIL = process.env.AUTH_MONITOR_EMAIL || 'auth-monitor@jov.ie';

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('❌ CLERK_SECRET_KEY not set (run under Doppler).');
    process.exit(1);
  }
  const isLive = secretKey.startsWith('sk_live_');
  if (isLive && !process.argv.includes('--confirm')) {
    console.error(
      '❌ Refusing to create a user on a LIVE Clerk instance without --confirm.\n' +
        '   Re-run with --confirm to provision the production auth monitor (+1 MAU).'
    );
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey });

  const existing = await clerk.users.getUserList({ emailAddress: [EMAIL] });
  if (existing.totalCount > 0) {
    const user = existing.data[0];
    console.log(`✅ Auth monitor already exists: ${user.id} (${EMAIL})`);
    console.log(`AUTH_MONITOR_USER_ID=${user.id}`);
    return;
  }

  const user = await clerk.users.createUser({
    emailAddress: [EMAIL],
    skipPasswordRequirement: true, // token-only; never holds a credential
    publicMetadata: { role: 'auth-monitor' },
    privateMetadata: {
      role: 'auth-monitor',
      purpose: 'synthetic-auth-sentinel',
    },
  });

  console.log(`✅ Created auth monitor user: ${user.id} (${EMAIL})`);
  console.log(`AUTH_MONITOR_USER_ID=${user.id}`);
  console.log(
    '\nThe session monitor finds this user by email at runtime, so no new ' +
      'secret is required — it only needs CLERK_SECRET_KEY (already a prod secret).'
  );
}

main().catch(err => {
  console.error('❌ setup-prod-auth-monitor failed:', err);
  process.exit(1);
});
