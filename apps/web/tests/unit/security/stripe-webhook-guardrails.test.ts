import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const WEBHOOK_HANDLERS_DIR = join(
  WEB_ROOT,
  'lib',
  'stripe',
  'webhooks',
  'handlers'
);

describe('closed-loop guardrail: Stripe webhook Better Auth, customer extraction, and replay safety', () => {
  it('forbids raw typeof *.customer === "string" checks in Stripe webhook handlers', () => {
    const handlerFiles = readdirSync(WEBHOOK_HANDLERS_DIR).filter(
      f => f.endsWith('.ts') && !f.endsWith('.test.ts')
    );
    const violations: string[] = [];

    for (const file of handlerFiles) {
      const full = join(WEBHOOK_HANDLERS_DIR, file);
      const source = readFileSync(full, 'utf8');
      if (/typeof\s+\w+\.customer\s*===\s*['"]string['"]/.test(source)) {
        violations.push(relative(WEB_ROOT, full));
      }
    }

    expect(violations).toEqual([]);
  });

  it('requires getUserIdFromStripeCustomer to fall back to canonical users.id for Better Auth accounts', () => {
    const utilsSource = readFileSync(
      join(WEB_ROOT, 'lib/stripe/webhooks/utils.ts'),
      'utf8'
    );
    expect(utilsSource).toContain('id: users.id');
    expect(utilsSource).toMatch(/user\?\.clerkId\s*\|\|\s*user\?\.id/);
  });

  it('requires every webhook downgrade to guard expectedSubscriptionId and clear stripePriceId', () => {
    const downgradeFiles = [
      'lib/stripe/webhooks/base-handler.ts',
      'lib/stripe/webhooks/handlers/subscription-handler.ts',
      'lib/stripe/webhooks/handlers/payment-handler.ts',
      'lib/stripe/webhooks/handlers/charge-handler.ts',
    ];

    for (const relPath of downgradeFiles) {
      const source = readFileSync(join(WEB_ROOT, relPath), 'utf8');
      expect(source).toContain('expectedSubscriptionId: subscription.id');
      expect(source).toContain('stripePriceId: null');
    }
  });

  it('requires checkout-session validation to enforce settled payment_status', () => {
    const routeSource = readFileSync(
      join(WEB_ROOT, 'app/api/billing/checkout-session/route.ts'),
      'utf8'
    );
    expect(routeSource).toContain('isSettledCheckoutPaymentStatus');
    expect(routeSource).toContain('session.payment_status');
  });
});
