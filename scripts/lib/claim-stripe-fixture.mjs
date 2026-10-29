// Live probe of the Stripe test fixture the claim dogfood charges against.
//
// The shape-only environment check (validateClaimTestEnvironment) cannot
// detect a revoked test key or a fixture price that was archived or edited in
// the Stripe dashboard. Those failures previously surfaced ~15 minutes into
// the build+journey cycle as an anonymous red (dogfood red on every main run
// since 2026-10-28 while the same-secret Golden Path journey stayed green —
// its spec never retrieves the fixture price).
//
// This probe enforces the same fail-closed fixture contract the journey
// enforces (apps/web/lib/stripe/test-price-contract.ts) BEFORE any expensive
// step, and names the exact env var and its store on failure. It is live only
// inside the claim dogfood workflow (shouldProbeLiveFixture) so unit tests
// with synthetic fixture ids never touch the network. It never prints secret
// values; messages name environment variables and Stripe API details only.

/** @param {Record<string, string | undefined>} env */
export function shouldProbeLiveFixture(env) {
  return (
    env.CLAIM_STRIPE_FIXTURE_PROBE === '1' ||
    env.GITHUB_WORKFLOW === 'Claim Checkout Dogfood'
  );
}

/**
 * Mirror of assertArtistVisibilityStripeTestPrice in
 * apps/web/lib/stripe/test-price-contract.ts and the published monthly offer
 * ($12/month, metadata decision tim-2026-10-20-artist-profile-12). Keep in
 * sync with that file — scripts cannot import apps/web TypeScript.
 */
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

const SECRET_STORE =
  'GitHub Actions environment "Preview - jovie" of JovieInc/Jovie (Settings > Environments > Preview - jovie)';

const REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_TEST_ACCOUNT_ID',
  'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
  'STRIPE_WEBHOOK_SECRET',
];

/**
 * Compare a retrieved Stripe price against the fixture contract.
 * @param {Record<string, unknown>} price a Stripe Price object
 * @returns {string[]} human-readable mismatch list, empty when it matches
 */
export function stripeFixtureMismatches(price) {
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
  return Object.entries(EXPECTED_PRICE)
    .filter(([field, expected]) => actual[field] !== expected)
    .map(
      ([field, expected]) =>
        `${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual[field])}`
    );
}

/**
 * Live-check the fixture: key works, key's account matches
 * STRIPE_TEST_ACCOUNT_ID, and the configured price is the $12/month test
 * fixture. Fails closed with a named message per broken input.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch }} [hooks]
 * @returns {Promise<{ ok: boolean, failures: string[] }>}
 */
export async function probeStripeTestFixture(
  env,
  { fetchImpl = fetch } = {}
) {
  const failures = [];
  const missing = REQUIRED_VARS.filter(name => !env[name]);
  for (const name of missing) {
    failures.push(
      `${name} is not set in this job. Configure it as a secret in ${SECRET_STORE}.`
    );
  }
  if (missing.length > 0) return { ok: false, failures };

  const key = env.STRIPE_SECRET_KEY ?? '';
  const priceId = env.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY ?? '';
  if (!key.startsWith('sk_test_')) {
    return {
      ok: false,
      failures: [
        `STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_). Live keys are refused fail-closed. Update it in ${SECRET_STORE}.`,
      ],
    };
  }

  const stripeGet = async path => {
    let response;
    try {
      response = await fetchImpl(`https://api.stripe.com/v1${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      failures.push(
        `Stripe API call ${path} could not be reached: ${error?.message ?? error}. Check network egress and STRIPE_SECRET_KEY in ${SECRET_STORE}.`
      );
      return null;
    }
    const body = await response.json().catch(() => null);
    if (response.ok) return body;
    const detail =
      body && typeof body === 'object' && 'message' in body
        ? body.message
        : `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      failures.push(
        `Stripe rejected STRIPE_SECRET_KEY (${detail}). The test key was likely rotated or revoked; set the current sk_test_ key in ${SECRET_STORE}.`
      );
    } else if (response.status === 404 && path.startsWith('/prices/')) {
      failures.push(
        `Fixture price ${priceId} (STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY) does not exist on this test account. If it was replaced in the Stripe dashboard, update the hardcoded fixture in .github/workflows/claim-checkout-dogfood.yml or rotate STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY in ${SECRET_STORE}.`
      );
    } else {
      failures.push(`Stripe API call ${path} failed: ${detail}.`);
    }
    return null;
  };

  const account = await stripeGet('/account');
  if (account) {
    if (account.id !== env.STRIPE_TEST_ACCOUNT_ID) {
      failures.push(
        `STRIPE_SECRET_KEY belongs to Stripe account ${account.id} but STRIPE_TEST_ACCOUNT_ID is ${env.STRIPE_TEST_ACCOUNT_ID}. Align the key and the account id in ${SECRET_STORE} / the workflow.`
      );
    }
  }
  if (failures.length > 0) return { ok: false, failures };

  const price = await stripeGet(`/prices/${encodeURIComponent(priceId)}`);
  if (price) {
    for (const mismatch of stripeFixtureMismatches(price)) {
      failures.push(
        `Fixture price ${priceId} no longer matches the $12/month Artist Visibility test contract (${mismatch}). Restore or recreate the fixture in the Stripe test dashboard with the same metadata, and keep STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY pointing at it in ${SECRET_STORE}.`
      );
    }
  }
  return { ok: failures.length === 0, failures };
}
