import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * JOV-6234: the real-model eval workflow carries an explicit cost-eligibility
 * contract. Push events to main carry no eligibility inputs, so they can never
 * authorize live spend on their own; only a manual dispatch that supplies the
 * eligibility inputs builds the token, and a missing token drops the run to
 * disabled-guard mode (no automatic metered fallback).
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = readFileSync(
  join(repoRoot, '.github/workflows/eval-real-model.yml'),
  'utf8'
);

describe('eval-real-model workflow cost eligibility (JOV-6234)', () => {
  it('declares the eligibility inputs and wires them as env vars', () => {
    expect(workflow).toContain('cost_eligibility_account');
    expect(workflow).toContain('cost_eligibility_provider');
    expect(workflow).toContain('REAL_EVAL_ELIGIBILITY_ACCOUNT:');
    expect(workflow).toContain('REAL_EVAL_ELIGIBILITY_PROVIDER:');
  });

  it('builds the eligibility token only when a dispatch supplied both fields', () => {
    expect(workflow).toContain("REAL_EVAL_ELIGIBILITY=''");
    expect(workflow).toContain(
      '[ -n "$REAL_EVAL_ELIGIBILITY_ACCOUNT" ] && [ -n "$REAL_EVAL_ELIGIBILITY_PROVIDER" ]'
    );
    // The token is exported only after being built (or left empty).
    expect(workflow).toContain('export REAL_EVAL_ELIGIBILITY');
  });

  it('requires eligibility in addition to gateway keys for live spend', () => {
    expect(workflow).toContain(
      '[ -z "$AI_GATEWAY_API_KEY" ] || [ -z "$HELICONE_API_KEY" ] || [ -z "$REAL_EVAL_ELIGIBILITY" ]'
    );
    // Disabled-guard mode clears the flag AND the eligibility token so the
    // guard test sees a fully unauthorized environment.
    expect(workflow).toContain(
      "JOVIE_RUN_REAL_MODEL_EVALS='' REAL_EVAL_ELIGIBILITY='' pnpm exec vitest run"
    );
  });

  it('never fans out from pull requests (unchanged)', () => {
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).toContain('pnpm exec vitest run');
  });
});
