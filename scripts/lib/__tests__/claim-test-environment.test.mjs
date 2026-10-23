import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateClaimTestEnvironment } from '../claim-test-environment.mjs';
import { buildPreviewEnvAdmission } from '../preview-env-contract.mjs';

const now = Date.parse('2026-10-23T06:00:00Z');
const url = host =>
  `postgresql://fixture:not-a-real-secret@${host}.neon.tech/neondb?sslmode=require`;
function valid() {
  return {
    databaseUrl: url('ep-synthetic-pooler.us-east-2.aws'),
    connection: {
      db_url: url('ep-synthetic.us-east-2.aws'),
      db_url_pooled: url('ep-synthetic-pooler.us-east-2.aws'),
      branch_id: 'br-synthetic-fixture',
      branch_name: 'claim-dogfood-12345678-1',
    },
    protectedDatabaseUrls: [url('ep-protected.us-east-2.aws')],
    expected: {
      sha: 'a'.repeat(40),
      branchId: 'br-synthetic-fixture',
      branchName: 'claim-dogfood-12345678-1',
    },
    admission: buildPreviewEnvAdmission({
      kind: 'neon-branch',
      workId: 'JOV-6275',
      sha: 'a'.repeat(40),
      policy: 'manual-dispatch',
      reason: 'Synthetic regression only, no infrastructure',
      requiredEvidence: 'Configuration binding',
      owner: 'fixture',
      surface: 'test',
      createdAt: '2026-10-23T05:00:00Z',
      expiresAt: '2026-10-23T07:00:00Z',
      environment: 'claim-dogfood-12345678-1',
      cleanupTrigger: 'terminal-proof',
      cleanupProof: 'Run-owned fixture disposition receipt',
      costBudget: 'no network',
    }),
    appOrigin: 'http://localhost:3260',
    authMode: 'local-test-auth-bypass',
    outboundCredentialNames: [],
    stripe: {
      secretKey: 'sk_test_fixture',
      accountId: 'acct_fixture',
      priceId: 'price_fixture',
      webhookSecret: 'whsec_fixture',
    },
  };
}
const check = input => validateClaimTestEnvironment(input, { now });

describe('claim test environment binding', () => {
  it.each([null, undefined, []])(
    'fails closed on a missing environment',
    input => {
      expect(check(input)).toMatchObject({
        ok: false,
        genuineSignupProven: false,
      });
    }
  );
  it('fails closed on null nested bindings', () => {
    expect(check({ ...valid(), expected: null, stripe: null }).ok).toBe(false);
  });
  it('accepts a bound synthetic branch while stating its limited evidence', () => {
    expect(check(valid())).toMatchObject({
      ok: true,
      genuineSignupProven: false,
      webhookDelivery: 'signed-fixture',
      databaseEvidence: 'runner-artifact-binding',
      liveBranchIdentityVerified: false,
      databaseContentsVerified: false,
      outboundEvidence: 'credential-presence-only',
    });
  });
  it.each(['ep-synthetic.us-east-2.aws', 'ep-synthetic-pooler.us-east-2.aws'])(
    'rejects the protected target through either Neon hostname: %s',
    host => {
      const input = valid();
      input.protectedDatabaseUrls = [url(host)];
      expect(check(input).blockers).toContain('database_target_shared');
    }
  );
  it('rejects the same endpoint with a different database name', () => {
    const input = valid();
    input.protectedDatabaseUrls = [
      url('ep-synthetic.us-east-2.aws').replace('/neondb?', '/another?'),
    ];
    expect(check(input).blockers).toContain('database_target_shared');
  });
  it.each([
    null,
    'not-a-url',
    '',
    'postgresql://fixture@ep-synthetic.neon.tech/db',
    url('ep-synthetic').replace('not-a-real-secret', '***'),
    'postgresql://fixture:secret@localhost/db',
    `${url('ep-synthetic.us-east-2.aws')}&host=ep-protected.neon.tech`,
    `${url('ep-synthetic.us-east-2.aws')}&sslmode=disable`,
    url('ep-synthetic.us-east-2.aws').replace(
      'sslmode=require',
      'sslmode=disable'
    ),
  ])(
    'fails closed on an unusable/overridden connection without echoing it',
    value => {
      const input = valid();
      input.databaseUrl = value;
      const result = check(input);
      expect(result.blockers).toContain('database_url_invalid');
      expect(JSON.stringify(result)).not.toContain('postgresql://');
      expect(JSON.stringify(result)).not.toContain('not-a-real-secret');
    }
  );
  it.each([undefined, []])('requires protected database references', refs => {
    const input = valid();
    input.protectedDatabaseUrls = refs;
    expect(check(input).blockers).toContain(
      'protected_database_reference_missing'
    );
  });
  it('does not ignore a malformed protected reference', () => {
    const input = valid();
    input.protectedDatabaseUrls.push('bad');
    expect(check(input).blockers).toContain(
      'protected_database_reference_invalid'
    );
  });
  it('rejects a mismatched artifact even when the candidate is distinct', () => {
    const input = valid();
    input.connection.db_url = url('ep-another.us-east-2.aws');
    expect(check(input).blockers).toContain('database_artifact_mismatch');
  });
  it.each(['branch_id', 'branch_name'])(
    'rejects another action artifact %s',
    field => {
      const input = valid();
      input.connection[field] = 'other';
      expect(check(input).ok).toBe(false);
    }
  );
  it.each(['sha', 'environment'])(
    'rejects admission subject drift: %s',
    field => {
      const input = valid();
      input.admission[field] = 'other';
      expect(check(input).ok).toBe(false);
    }
  );
  it.each(['2026-10-23T05:59:59Z', 'invalid'])(
    'rejects expired/malformed expiry %s',
    expiry => {
      const input = valid();
      input.admission.expiresAt = expiry;
      expect(check(input).blockers).toContain('admission_invalid_or_expired');
    }
  );
  it('rejects a future-created admission', () => {
    const input = valid();
    input.admission.createdAt = '2026-10-23T06:01:00Z';
    expect(check(input).blockers).toContain('admission_invalid_or_expired');
  });
  it.each([
    'https://jov.ie',
    'https://staging.jov.ie',
    'http://localhost.evil.test',
    'http://localhost:3260/?next=prod',
    'not-an-origin',
  ])('refuses nonlocal or ambiguous application origin %s', origin => {
    const input = valid();
    input.appOrigin = origin;
    expect(check(input).blockers).toContain(
      'application_origin_not_isolated_local'
    );
  });
  it('never downgrades requested real OTP to bypass evidence', () => {
    const input = valid();
    input.authMode = 'real-email-otp';
    expect(check(input)).toMatchObject({
      ok: false,
      genuineSignupProven: false,
      authMode: 'unverified',
    });
  });
  it('requires explicit outbound readiness rather than assuming absence', () => {
    const input = valid();
    delete input.outboundCredentialNames;
    expect(check(input).blockers).toContain('outbound_binding_missing');
  });
  it('refuses notification credentials in the bypass fixture runtime', () => {
    const input = valid();
    input.outboundCredentialNames = ['RESEND_API_KEY'];
    expect(check(input).blockers).toContain('outbound_credentials_present');
  });
  it.each(['secretKey', 'accountId', 'priceId', 'webhookSecret'])(
    'requires explicit test Stripe binding %s',
    field => {
      const input = valid();
      input.stripe[field] = '';
      expect(check(input).ok).toBe(false);
    }
  );
  it('rejects a live key even if test object ids were supplied', () => {
    const input = valid();
    input.stripe.secretKey = 'sk_live_fixture';
    expect(check(input).blockers).toContain('stripe_test_key_required');
  });
});

describe('runner preflight and workflow boundary', () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });
  function run(overrides = {}, { privateFile = true } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-isolation-test-'));
    dirs.push(dir);
    const input = valid();
    input.admission.createdAt = new Date(Date.now() - 60000).toISOString();
    input.admission.expiresAt = new Date(Date.now() + 60000).toISOString();
    const connection = join(dir, 'connection.json');
    const admission = join(dir, 'admission.json');
    const receipt = join(dir, 'check.json');
    writeFileSync(connection, JSON.stringify(input.connection), {
      mode: 0o600,
    });
    chmodSync(connection, privateFile ? 0o600 : 0o644);
    writeFileSync(admission, JSON.stringify(input.admission));
    const env = {
      CLAIM_CONNECTION_FILE: connection,
      CLAIM_ADMISSION_FILE: admission,
      CLAIM_ENV_RECEIPT: receipt,
      DATABASE_URL: input.databaseUrl,
      PROTECTED_DATABASE_URL: input.protectedDatabaseUrls[0],
      DOGFOOD_RESOLVED_SHA: input.expected.sha,
      CLAIM_EXPECTED_BRANCH_ID: input.expected.branchId,
      CLAIM_EXPECTED_BRANCH_NAME: input.expected.branchName,
      CLAIM_APP_ORIGIN: input.appOrigin,
      CLAIM_AUTH_MODE: input.authMode,
      STRIPE_SECRET_KEY: input.stripe.secretKey,
      STRIPE_TEST_ACCOUNT_ID: input.stripe.accountId,
      STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: input.stripe.priceId,
      STRIPE_WEBHOOK_SECRET: input.stripe.webhookSecret,
      ...overrides,
    };
    const child = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../../claim-test-environment.mjs')],
      {
        env,
        encoding: 'utf8',
        timeout: 5000,
      }
    );
    const saved = JSON.parse(readFileSync(receipt, 'utf8'));
    expect(child.stdout + child.stderr + JSON.stringify(saved)).not.toContain(
      'not-a-real-secret'
    );
    expect(child.stdout + child.stderr + JSON.stringify(saved)).not.toContain(
      'postgresql://'
    );
    return { child, saved };
  }
  it('executes the real CLI and records bounded bypass evidence', () => {
    const { child, saved } = run();
    expect(child.status).toBe(0);
    expect(saved).toMatchObject({
      ok: true,
      genuineSignupProven: false,
      authMode: 'local-test-auth-bypass',
    });
  });
  it('returns nonzero before any migration when supplied the shared target', () => {
    const { child, saved } = run({
      PROTECTED_DATABASE_URL: valid().databaseUrl,
    });
    expect(child.status).toBe(1);
    expect(saved.blockers).toContain('database_target_shared');
  });
  it('refuses a readable-by-others connection artifact', () => {
    const { child, saved } = run({}, { privateFile: false });
    expect(child.status).toBe(1);
    expect(saved.blockers).toContain('connection_artifact_not_private');
  });
  it('refuses real email delivery credentials in the existing bypass lane', () => {
    const { child, saved } = run({ RESEND_API_KEY: 'test-only-placeholder' });
    expect(child.status).toBe(1);
    expect(saved.blockers).toContain('outbound_credentials_present');
  });
  it('refuses libpq endpoint options', () => {
    expect(
      check({
        ...valid(),
        databaseUrl: `${valid().databaseUrl}&options=endpoint%3Dep-protected`,
      }).blockers
    ).toContain('database_url_invalid');
  });
  it('keeps target preflight before all migrations and publishes its failure receipt', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/claim-checkout-dogfood.yml'
      ),
      'utf8'
    );
    const guard = workflow.indexOf('node scripts/claim-test-environment.mjs');
    const migration = workflow.indexOf(
      '- name: Run migrations (ephemeral Neon)'
    );
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(migration);
    expect(workflow).toContain('environment-check.json');
    const resolver = workflow.slice(
      workflow.indexOf('- name: Resolve DATABASE_URL'),
      workflow.indexOf('- name: Export DATABASE_URL')
    );
    expect(resolver).toContain('connection_file:');
    expect(resolver).not.toContain('credential_source_url:');
    expect(resolver).not.toContain('credential_fallback_url:');
    expect(workflow).toContain('DOGFOOD_RESOLVED_SHA=$(git rev-parse HEAD)');
    expect(workflow).toContain(
      'CLAIM_CONNECTION_FILE: ${{ steps.neon-branch.outputs.connection_file }}'
    );
  });
});
