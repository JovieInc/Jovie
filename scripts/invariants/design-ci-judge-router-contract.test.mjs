import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DESIGN_CI_JUDGE_ROUTER_INVARIANT_ID,
  evaluateDesignCiJudgeRouterContract,
} from './design-ci-judge-router-contract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function source(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('JOV-INV-040 design-ci judge router contract', () => {
  it('accepts the checked-in router wiring', () => {
    assert.equal(DESIGN_CI_JUDGE_ROUTER_INVARIANT_ID, 'JOV-INV-040');
    assert.deepEqual(evaluateDesignCiJudgeRouterContract(), []);
  });

  it('deliberate red: rejects a router that lost its invariant self-reference', () => {
    const path = 'apps/web/scripts/design-ci-judge-router.ts';
    const failures = evaluateDesignCiJudgeRouterContract({
      files: { [path]: source(path).replaceAll('JOV-INV-040', 'JOV-INV-000') },
    });
    assert.match(failures.join('\n'), /JOV-INV-040/);
  });

  it('deliberate red: rejects an adapter that moved off the real certification key', () => {
    const path = 'apps/web/lib/agent-os/design-ci-judge-certification.ts';
    const failures = evaluateDesignCiJudgeRouterContract({
      files: {
        [path]: source(path).replace(
          "'jovie:certification:v1:design-ci-judge-matrix'",
          "'design-ci-judge-matrix-standalone'"
        ),
      },
    });
    assert.match(
      failures.join('\n'),
      /jovie:certification:v1:design-ci-judge-matrix/
    );
  });

  it('deliberate red: rejects a missing evidence route', () => {
    const path =
      'apps/web/app/api/internal/ovie/design-ci-judge-evidence/route.ts';
    const failures = evaluateDesignCiJudgeRouterContract({
      files: {
        [path]: source(path).replaceAll('verifyCronRequest', 'skipAuth'),
      },
    });
    assert.match(failures.join('\n'), /verifyCronRequest/);
  });

  it('deliberate red: rejects the CLI script going missing from package.json', () => {
    const failures = evaluateDesignCiJudgeRouterContract({
      files: {
        'apps/web/package.json': source('apps/web/package.json').replace(
          '"design-ci:judge-matrix"',
          '"design-ci-judge-matrix-renamed"'
        ),
      },
    });
    assert.match(failures.join('\n'), /design-ci:judge-matrix/);
  });
});
