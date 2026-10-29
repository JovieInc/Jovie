#!/usr/bin/env node
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateClaimTestEnvironment } from './lib/claim-test-environment.mjs';

const OUTBOUND_KEYS = [
  'RESEND_API_KEY',
  'SLACK_WEBHOOK_URL',
  'TWILIO_AUTH_TOKEN',
  'CLICKSEND_API_KEY',
];

/** Read only runner-owned files. Errors deliberately exclude parser/URL text. */
export function checkClaimTestEnvironment(env, { now = Date.now() } = {}) {
  try {
    if (
      !env.CLAIM_CONNECTION_FILE ||
      (statSync(env.CLAIM_CONNECTION_FILE).mode & 0o077) !== 0
    ) {
      return {
        ok: false,
        blockers: ['connection_artifact_not_private'],
        genuineSignupProven: false,
      };
    }
    const connection = JSON.parse(
      readFileSync(env.CLAIM_CONNECTION_FILE, 'utf8')
    );
    const admission = JSON.parse(
      readFileSync(env.CLAIM_ADMISSION_FILE, 'utf8')
    );
    return validateClaimTestEnvironment(
      {
        admission,
        connection,
        databaseUrl: env.DATABASE_URL,
        protectedDatabaseUrls: [
          env.PROTECTED_DATABASE_URL,
          env.PROTECTED_FALLBACK_DATABASE_URL,
        ].filter(Boolean),
        expected: {
          sha: env.DOGFOOD_RESOLVED_SHA,
          branchId: env.CLAIM_EXPECTED_BRANCH_ID,
          branchName: env.CLAIM_EXPECTED_BRANCH_NAME,
        },
        appOrigin: env.CLAIM_APP_ORIGIN,
        authMode: env.CLAIM_AUTH_MODE,
        outboundCredentialNames: OUTBOUND_KEYS.filter(key => Boolean(env[key])),
        stripe: {
          secretKey: env.STRIPE_SECRET_KEY,
          accountId: env.STRIPE_TEST_ACCOUNT_ID,
          priceId: env.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        },
      },
      { now }
    );
  } catch {
    return {
      ok: false,
      blockers: ['environment_files_unreadable'],
      genuineSignupProven: false,
    };
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkClaimTestEnvironment(process.env);
  const receipt = {
    schema: 'jovie.claim-test-environment/v1',
    checkedAt: new Date().toISOString(),
    candidateSha: /^[a-f0-9]{40}$/.test(process.env.DOGFOOD_RESOLVED_SHA ?? '')
      ? process.env.DOGFOOD_RESOLVED_SHA
      : null,
    ...result,
  };
  if (process.env.CLAIM_ENV_RECEIPT) {
    writeFileSync(
      process.env.CLAIM_ENV_RECEIPT,
      `${JSON.stringify(receipt, null, 2)}\n`,
      { mode: 0o600 }
    );
  }
  console.log(JSON.stringify(receipt));
  process.exitCode = result.ok ? 0 : 1;
}
