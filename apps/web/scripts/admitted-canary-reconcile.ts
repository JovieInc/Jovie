#!/usr/bin/env tsx
/**
 * Bring production to the admitted canary fixture
 * (`lib/synthetic/admitted-canary-fixture.ts`) and write a
 * `jovie.admitted-canary-receipt/v1`.
 *
 *   doppler run -p jovie-web -c prd -- pnpm --filter @jovie/web \
 *     admitted-canary:reconcile                 # dry run: plan only
 *   ... admitted-canary:reconcile --apply       # converge
 *
 * Dry run reads only. Apply first signs the canary in through the deployed
 * product (Better Auth email OTP; the code is read from `ba_verifications`
 * by the canary-only reader), which provisions the app user and waitlist
 * entry, then runs `reconcileAdmittedCanary` (product domain functions,
 * canary-scoped writes only).
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  readAdmittedCanaryState,
  reconcileAdmittedCanary,
} from '@/lib/synthetic/admitted-canary.server';
import {
  ADMITTED_CANARY_FIXTURE,
  ADMITTED_CANARY_FIXTURE_SCHEMA,
  ADMITTED_CANARY_RECEIPT_SCHEMA,
  type AdmittedCanaryReceipt,
} from '@/lib/synthetic/admitted-canary-fixture';
import { waitForProductionAuthOtp } from '../tests/e2e/utils/production-auth-otp';

const HTTP_TIMEOUT_MS = 15_000;

async function postJson(origin: string, path: string, body: unknown) {
  return fetch(new URL(path, origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
}

async function readProdSha(origin: string): Promise<string | null> {
  try {
    const response = await fetch(new URL('/api/health/build-info', origin), {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const json = (await response.json()) as { commitSha?: string };
    return /^[0-9a-f]{40}$/u.test(json.commitSha ?? '')
      ? (json.commitSha as string)
      : null;
  } catch {
    return null;
  }
}

/** Product path: the Better Auth user-create hook provisions the app user. */
async function signInCanary(origin: string): Promise<void> {
  const email = ADMITTED_CANARY_FIXTURE.email;
  const startedAtMs = Date.now();
  const send = await postJson(
    origin,
    '/api/auth/email-otp/send-verification-otp',
    {
      email,
      type: 'sign-in',
    }
  );
  if (!send.ok) throw new Error(`OTP send HTTP ${send.status}`);
  const otp = await waitForProductionAuthOtp({ email, startedAtMs });
  const signIn = await postJson(origin, '/api/auth/sign-in/email-otp', {
    email,
    otp,
  });
  if (!signIn.ok) throw new Error(`OTP sign-in HTTP ${signIn.status}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      origin: { type: 'string', default: 'https://jov.ie' },
      receipt: { type: 'string' },
    },
  });
  const apply = values.apply === true;
  const origin = values.origin as string;
  const startedAt = new Date().toISOString();
  const prodSha = await readProdSha(origin);

  if (apply && !(await readAdmittedCanaryState()).user) {
    await signInCanary(origin);
  }
  const { steps, converged } = await reconcileAdmittedCanary({ apply });

  const receipt: AdmittedCanaryReceipt = {
    schema: ADMITTED_CANARY_RECEIPT_SCHEMA,
    fixtureSchema: ADMITTED_CANARY_FIXTURE_SCHEMA,
    fixtureVersion: ADMITTED_CANARY_FIXTURE.version,
    mode: apply ? 'apply' : 'dry-run',
    prodSha,
    startedAt,
    endedAt: new Date().toISOString(),
    identity: {
      email: ADMITTED_CANARY_FIXTURE.email,
      handle: ADMITTED_CANARY_FIXTURE.handle,
      spotifyId: ADMITTED_CANARY_FIXTURE.artist.spotifyId,
    },
    steps,
    converged,
  };
  const text = JSON.stringify(receipt, null, 2);
  if (values.receipt) writeFileSync(values.receipt, `${text}\n`);
  process.stdout.write(`${text}\n`);
  if (apply && !converged) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
