// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  derivePassageKey,
  mintPassageToken,
  PASSAGE_TOKEN_SCOPE_CANARY_RESET,
  verifyPassageToken,
} from '@/lib/synthetic/passage-token';
import { PRODCERT_CLAIM_CANARY_EMAIL } from '@/lib/synthetic/prodcert-identities';
import { mintCanaryResetPassageToken } from '@/tests/e2e/helpers/canary-reset-client';

/**
 * JOV-9826 canary auth contract, pinned across every seam the walk crosses.
 *
 * Postdeploy red 45350750159 failed the canary walk with the reset route's
 * opaque 401 `Valid canary passage token required`, and two remediation
 * threads read it as auth contract drift between the probe and the route
 * (rotated secret, changed mint) — the real cause was the shared hourly
 * passage-grant budget. This suite makes the drift hypothesis permanently
 * cheap to check: it executes the REAL CI key-derivation script and mints
 * with the REAL walk-client parameters, then verifies with the REAL route
 * verifier. If this suite is green, a production 401 is a budget or config
 * condition, never a mint/verify contract drift — and if it goes red, the
 * drift is caught in unit CI before any probe ships it to staging.
 */

const ROOT_SECRET = 'cron-secret-for-contract-0123456789abcdef';
const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const keyScript = resolve(repoRoot, 'scripts/synthetic-passage-key.mjs');

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { force: true, recursive: true });
  }
});

describe('JOV-9826 canary reset passage contract (CI mint ↔ route verify)', () => {
  it("executes the real CI key script and its key equals the lib's verify key", () => {
    // The postdeploy job derives SYNTHETIC_PASSAGE_KEY by running this
    // exact script under Doppler CRON_SECRET (JOV-9822). Run it for real
    // here and prove the HKDF derivation still matches derivePassageKey —
    // the one equation every "reset 401 = secret drift" hypothesis rests on.
    expect(existsSync(keyScript)).toBe(true);
    const envDir = mkdtempSync(join(tmpdir(), 'passage-contract-'));
    tempDirs.push(envDir);
    const envFile = join(envDir, 'github.env');
    execFileSync(process.execPath, [keyScript], {
      env: {
        ...process.env,
        CRON_SECRET: ROOT_SECRET,
        GITHUB_ENV: envFile,
      },
      stdio: 'pipe',
    });
    const written = readFileSync(envFile, 'utf8');
    const match = /^SYNTHETIC_PASSAGE_KEY=([A-Za-z0-9_-]+)$/mu.exec(written);
    expect(
      match,
      `script wrote a parseable key: ${written.slice(0, 80)}`
    ).not.toBeNull();
    // The env name the walk client reads is the name the script writes.
    expect(written).toContain('SYNTHETIC_PASSAGE_KEY=');
    expect(match?.[1]).toBe(
      derivePassageKey(ROOT_SECRET).toString('base64url')
    );
  });

  it('the walk client mint satisfies the reset route verify (identity, scope, TTL, run)', () => {
    const key = derivePassageKey(ROOT_SECRET);
    const runTag = 'checkout-453507501591';
    // The client mints from the CI script's base64url key form; prove that
    // exact input round-trips the route's verifier.
    const token = mintCanaryResetPassageToken(
      key.toString('base64url'),
      runTag
    );
    const verdict = verifyPassageToken(
      token,
      key,
      PASSAGE_TOKEN_SCOPE_CANARY_RESET
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.claims.sub).toBe(PRODCERT_CLAIM_CANARY_EMAIL);
      expect(verdict.claims.scp).toBe('canary_reset');
      expect(verdict.claims.exp - verdict.claims.iat).toBe(300);
      expect(verdict.claims.run).toBe(runTag);
    }
  });

  it('a maximal run tag still satisfies the route claims pattern', () => {
    const key = derivePassageKey(ROOT_SECRET);
    const longTag = `checkout-${'9'.repeat(70)}`;
    const token = mintCanaryResetPassageToken(
      key.toString('base64url'),
      longTag
    );
    const verdict = verifyPassageToken(
      token,
      key,
      PASSAGE_TOKEN_SCOPE_CANARY_RESET
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      // The client clamps the tag to the verifier's 64-char run budget.
      expect(verdict.claims.run).toHaveLength(64);
    }
  });

  it('a passage minted for another scope never authorizes canary_reset', () => {
    const key = derivePassageKey(ROOT_SECRET);
    const wrongScope = mintPassageToken(key, {
      sub: PRODCERT_CLAIM_CANARY_EMAIL,
      scp: 'onboarding_chat',
      run: 'checkout-1',
    });
    expect(
      verifyPassageToken(wrongScope, key, PASSAGE_TOKEN_SCOPE_CANARY_RESET)
    ).toMatchObject({ ok: false, reason: 'wrong_scope' });
  });

  it('a passage minted from another root secret fails closed (bad signature)', () => {
    // If a surface's CRON_SECRET ever diverges from the run's, the walk
    // fails closed here — this is the exact drift class the 45350750159
    // red was misread as, now proven to be a signature failure, not a
    // silent acceptance.
    const key = derivePassageKey(ROOT_SECRET);
    const otherRoot = 'a-different-root-secret-0123456789abcd';
    const token = mintCanaryResetPassageToken(
      derivePassageKey(otherRoot).toString('base64url'),
      'checkout-1'
    );
    expect(
      verifyPassageToken(token, key, PASSAGE_TOKEN_SCOPE_CANARY_RESET)
    ).toMatchObject({ ok: false, reason: 'bad_signature' });
  });

  it('the walk TTL stays inside the route verifier ceiling', () => {
    const key = derivePassageKey(ROOT_SECRET);
    // A TTL beyond the lib's own ceiling cannot even be minted — pin the
    // 300s walk TTL against the 600s ceiling so drift in either direction
    // fails here first.
    expect(() =>
      mintPassageToken(key, {
        sub: PRODCERT_CLAIM_CANARY_EMAIL,
        scp: 'canary_reset',
        run: 'checkout-1',
        ttlSeconds: 601,
      })
    ).toThrow(/TTL/);
  });
});
