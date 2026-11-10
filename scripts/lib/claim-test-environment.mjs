import { isLivePreviewEnvAdmission } from './preview-env-contract.mjs';

const TARGET_OVERRIDES = new Set([
  'host',
  'hostaddr',
  'port',
  'dbname',
  'database',
  'user',
  'password',
  'service',
  'servicefile',
  'options',
]);

// Never return a URL or a parser error: both can contain credentials.
function databaseTarget(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname.endsWith('.neon.tech') ||
      (url.port && url.port !== '5432') ||
      !url.username ||
      !url.password ||
      !url.pathname.slice(1) ||
      url.hash ||
      [url.username, url.password].some(
        part => decodeURIComponent(part) === '***'
      ) ||
      [...url.searchParams.keys()].some(key =>
        TARGET_OVERRIDES.has(key.toLowerCase())
      ) ||
      url.searchParams
        .getAll('sslmode')
        .some(mode => ['disable', 'allow', 'prefer'].includes(mode))
    )
      return null;
    return {
      host: url.hostname.replace(/-pooler\./, '.'),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  } catch {
    return null;
  }
}

function isLocalOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/** Compose existing admission with the trusted branch action's private artifact.
 * This validates configuration binding, not live DB contents/RLS or real signup.
 */
export function validateClaimTestEnvironment(input, { now = Date.now() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      blockers: ['environment_input_invalid'],
      genuineSignupProven: false,
    };
  }
  const blockers = new Set();
  const fail = code => blockers.add(code);
  const { admission, connection } = input;
  const expected = input.expected ?? {};
  const stripe = input.stripe ?? {};
  if (
    !isLivePreviewEnvAdmission(admission, { now }) ||
    Date.parse(admission?.createdAt) > now ||
    admission?.kind !== 'neon-branch'
  ) {
    fail('admission_invalid_or_expired');
  }
  if (
    !/^[a-f0-9]{40}$/.test(expected.sha ?? '') ||
    admission?.sha !== expected.sha
  ) {
    fail('admission_sha_mismatch');
  }
  if (
    !/^claim-dogfood-\d+-\d+$/.test(expected.branchName ?? '') ||
    connection?.branch_name !== expected.branchName ||
    admission?.environment !== expected.branchName
  )
    fail('branch_name_mismatch');
  if (
    !/^br-[a-z0-9-]+$/.test(expected.branchId ?? '') ||
    connection?.branch_id !== expected.branchId
  )
    fail('branch_id_mismatch');

  const target = databaseTarget(input.databaseUrl);
  const direct = databaseTarget(connection?.db_url);
  const pooled = databaseTarget(connection?.db_url_pooled);
  if (!target || !direct || !pooled) fail('database_url_invalid');
  if (
    target &&
    direct &&
    pooled &&
    [direct, pooled].some(
      candidate =>
        candidate.host !== target.host || candidate.database !== target.database
    )
  )
    fail('database_artifact_mismatch');

  const protectedUrls = input.protectedDatabaseUrls;
  if (!Array.isArray(protectedUrls) || protectedUrls.length === 0) {
    fail('protected_database_reference_missing');
  } else {
    for (const value of protectedUrls) {
      const protectedTarget = databaseTarget(value);
      if (!protectedTarget) fail('protected_database_reference_invalid');
      // Same endpoint is unsafe even if another database/schema was requested.
      if (target && protectedTarget?.host === target.host)
        fail('database_target_shared');
    }
  }
  if (!isLocalOrigin(input.appOrigin))
    fail('application_origin_not_isolated_local');
  if (input.authMode !== 'local-test-auth-bypass') {
    // Real OTP requires its own verified mailbox/outbound binding. Never downgrade.
    fail('real_otp_containment_not_bound');
  }
  if (!Array.isArray(input.outboundCredentialNames))
    fail('outbound_binding_missing');
  else if (input.outboundCredentialNames.length)
    fail('outbound_credentials_present');
  if (
    typeof stripe.secretKey !== 'string' ||
    !stripe.secretKey.startsWith('sk_test_')
  )
    fail('stripe_test_key_required');
  if (!/^acct_[a-zA-Z0-9]+$/.test(stripe.accountId ?? ''))
    fail('stripe_test_account_required');
  if (!/^price_[a-zA-Z0-9]+$/.test(stripe.priceId ?? ''))
    fail('stripe_test_price_required');
  if (
    typeof stripe.webhookSecret !== 'string' ||
    !stripe.webhookSecret.startsWith('whsec_')
  )
    fail('stripe_test_webhook_required');
  return {
    ok: blockers.size === 0,
    blockers: [...blockers].sort(),
    authMode:
      input.authMode === 'local-test-auth-bypass'
        ? input.authMode
        : 'unverified',
    paymentMode: 'test',
    webhookDelivery: 'signed-fixture',
    providerObjectValidation: 'required-in-journey',
    databaseEvidence: 'runner-artifact-binding',
    liveBranchIdentityVerified: false,
    databaseContentsVerified: false,
    outboundEvidence: 'credential-presence-only',
    genuineSignupProven: false,
  };
}
