#!/usr/bin/env node
// Fail-fast live check of the Stripe test fixture the claim dogfood depends on
// (.github/workflows/claim-checkout-dogfood.yml).
//
// The shape-only preflight (scripts/claim-test-environment.mjs) cannot detect
// a revoked test key or a fixture price that was archived/edited in the
// Stripe dashboard; those otherwise surface as an anonymous red ~15 minutes
// into the build+journey cycle (dogfood red on every main run since
// 2026-10-28 while the same-secret Golden Path journey stayed green — its
// spec never retrieves the fixture price).
//
// This probe enforces the SAME fail-closed contract the journey enforces
// (apps/web/lib/stripe/test-price-contract.ts) before any expensive step, and
// names the exact env var and its store on failure. It never skips or relaxes
// the journey: when the fixture is healthy this step passes and the run
// proceeds unchanged.

const SECRET_STORE =
  'GitHub Actions environment "Preview - jovie" of JovieInc/Jovie (Settings > Environments > Preview - jovie)';

const REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_TEST_ACCOUNT_ID',
  'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
  'STRIPE_WEBHOOK_SECRET',
];

// Mirror of ARTIST_VISIBILITY_PRICE_METADATA + the published monthly offer
// assertions in test-price-contract.ts. Keep in sync.
const EXPECTED_PRICE = {
  livemode: false,
  active: true,
  currency: 'usd',
  unit_amount: 1200,
  type: 'recurring',
  'recurring.interval': 'month',
  'recurring.interval_count': 1,
  'metadata.offer': 'artist_visibility_pro',
  'metadata.decision': 'tim-2026-10-20-artist-profile-12',
};

function fail(messages) {
  for (const message of messages) {
    console.error(`::error title=claim-dogfood-stripe-fixture::${message}`);
  }
  process.exit(1);
}

const env = process.env;

const missing = REQUIRED_VARS.filter(name => !env[name]);
if (missing.length > 0) {
  fail(
    missing.map(
      name =>
        `${name} is not set in this job. Configure it as a secret in ${SECRET_STORE}.`
    )
  );
}

if (!env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  fail([
    `STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_). Live keys are refused fail-closed. Update it in ${SECRET_STORE}.`,
  ]);
}

const priceId = env.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY;

async function stripeGet(path) {
  let response;
  try {
    response = await fetch(`https://api.stripe.com/v1${path}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    fail([
      `Stripe API call ${path} could not be reached: ${error?.message ?? error}. If this persists, check network egress and STRIPE_SECRET_KEY in ${SECRET_STORE}.`,
    ]);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'message' in body
        ? body.message
        : `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      fail([
        `Stripe rejected STRIPE_SECRET_KEY (${detail}). The test key was likely rotated or revoked; set the current sk_test_ key in ${SECRET_STORE}.`,
      ]);
    }
    if (response.status === 404 && path.startsWith('/prices/')) {
      fail([
        `Fixture price ${priceId} (STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY) does not exist on this test account. Archive/replacement in the Stripe dashboard means this hardcoded fixture must be updated in .github/workflows/claim-checkout-dogfood.yml or the secret rotated in ${SECRET_STORE}.`,
      ]);
    }
    fail([`Stripe API call ${path} failed: ${detail}.`]);
  }
  return body;
}

const account = await stripeGet('/account');
if (account.id !== env.STRIPE_TEST_ACCOUNT_ID) {
  fail([
    `STRIPE_SECRET_KEY belongs to Stripe account ${account.id} but STRIPE_TEST_ACCOUNT_ID is ${env.STRIPE_TEST_ACCOUNT_ID}. Align the key and account id in ${SECRET_STORE} / the workflow.`,
  ]);
}

const price = await stripeGet(`/prices/${encodeURIComponent(priceId)}`);
const actual = {
  livemode: price.livemode,
  active: price.active,
  currency: price.currency,
  unit_amount: price.unit_amount,
  type: price.type,
  'recurring.interval': price.recurring?.interval,
  'recurring.interval_count': price.recurring?.interval_count,
  'metadata.offer': price.metadata?.offer,
  'metadata.decision': price.metadata?.decision,
};

const mismatches = Object.entries(EXPECTED_PRICE)
  .filter(([field, expected]) => actual[field] !== expected)
  .map(
    ([field, expected]) =>
      `${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual[field])}`
  );

if (mismatches.length > 0) {
  fail([
    `Fixture price ${priceId} no longer matches the $12/month Artist Visibility test contract: ${mismatches.join('; ')}. Restore or recreate the fixture in the Stripe test dashboard (same metadata) and keep STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY pointing at it in ${SECRET_STORE}.`,
  ]);
}

console.log(
  `claim-dogfood-stripe-preflight: Stripe test fixture OK (account ${account.id}, price ${priceId} = $12/month test fixture).`
);
