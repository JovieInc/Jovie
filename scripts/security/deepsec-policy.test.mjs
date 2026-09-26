import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DeepsecPolicyError,
  SECURITY_TARGETS,
  validateOfflinePolicy,
} from './deepsec-policy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const policyBytes = readFileSync(
  resolve(ROOT, 'scripts/security/deepsec/policy.json')
);
const targetsBytes = readFileSync(
  resolve(ROOT, 'scripts/security/deepsec/targets.json')
);
const approvedTargets = JSON.parse(targetsBytes.toString('utf8'));

function changedPolicy(change) {
  const policy = JSON.parse(policyBytes.toString('utf8'));
  change(policy);
  return Buffer.from(JSON.stringify(policy));
}

function changedTargets(change) {
  const manifest = structuredClone(approvedTargets);
  change(manifest);
  return Buffer.from(JSON.stringify(manifest));
}

function assertCode(code, run) {
  assert.throws(run, error => {
    assert.ok(error instanceof DeepsecPolicyError);
    assert.equal(error.code, code);
    return true;
  });
}

test('accepts only the pinned disabled local-subscription policy and nine targets', () => {
  const result = validateOfflinePolicy(policyBytes, targetsBytes);
  assert.equal(result.policy.modelAuth, 'local');
  assert.equal(result.policy.agent, 'codex');
  assert.equal(result.policy.model, 'gpt-5.5');
  assert.equal(result.policy.providerFallback, false);
  assert.equal(result.policy.billing.route, 'prepaid-codex-subscription');
  assert.equal(result.policy.billing.dollarBudgetUsd, null);
  assert.equal(result.policy.billing.stopOnExhaustion, true);
  assert.equal(result.policy.execution.status, 'disabled');
  assert.equal(result.policy.execution.scanEnabled, false);
  assert.deepEqual(result.targets, SECURITY_TARGETS);
  assert.equal(result.targets.length, 9);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.targets), true);
});

test('holds malformed UTF-8 and malformed JSON for either input', () => {
  assertCode('invalid-json', () =>
    validateOfflinePolicy(Buffer.from([0xff]), targetsBytes)
  );
  assertCode('invalid-json', () =>
    validateOfflinePolicy(Buffer.from('{'), targetsBytes)
  );
  assertCode('invalid-json', () =>
    validateOfflinePolicy(policyBytes, Buffer.from('{'))
  );
});

test('holds unsafe auth, model, billing, or enabled policy values before hash comparison', () => {
  const cases = [
    policy => {
      policy.schemaVersion = 2;
    },
    policy => {
      policy.projectId = 'other';
    },
    policy => {
      policy.maxTargets = 10;
    },
    policy => {
      policy.modelAuth = 'api';
    },
    policy => {
      policy.agent = 'other';
    },
    policy => {
      policy.model = 'other';
    },
    policy => {
      policy.providerFallback = true;
    },
    policy => {
      policy.billing.route = 'gateway';
    },
    policy => {
      policy.billing.stopOnExhaustion = false;
    },
    policy => {
      policy.execution.status = 'enabled';
    },
    policy => {
      policy.execution.scanEnabled = true;
    },
  ];
  for (const change of cases) {
    assertCode('policy-held', () =>
      validateOfflinePolicy(changedPolicy(change), targetsBytes)
    );
  }
});

test('rejects other policy-byte changes even when scan remains disabled', () => {
  assertCode('policy-drift', () =>
    validateOfflinePolicy(
      changedPolicy(policy => {
        policy.execution.toolNetwork = 'enabled';
      }),
      targetsBytes
    )
  );
});

test('holds wrong target-manifest shape, repository, bounds, or target count', () => {
  const invalidManifests = [
    Buffer.from('null'),
    Buffer.from('[]'),
    Buffer.from('3'),
    changedTargets(manifest => {
      manifest.schemaVersion = 2;
    }),
    changedTargets(manifest => {
      manifest.repository = 'other/repo';
    }),
    changedTargets(manifest => {
      manifest.maxTargets = 10;
    }),
    changedTargets(manifest => {
      delete manifest.repository;
    }),
    changedTargets(manifest => {
      manifest.extra = true;
    }),
    changedTargets(manifest => {
      manifest.targets.pop();
    }),
    changedTargets(manifest => {
      manifest.targets.push('apps/web/new.ts');
    }),
    changedTargets(manifest => {
      manifest.targets.reverse();
    }),
  ];
  for (const bytes of invalidManifests) {
    assertCode('targets-held', () => validateOfflinePolicy(policyBytes, bytes));
  }
});

test('rejects unsafe or unsupported target paths before exact-list comparison', () => {
  const unsafePaths = [
    null,
    '',
    'apps/web/lib/claim/finalize.ts\nother.ts',
    'apps/web/lib\\claim/finalize.ts',
    '/apps/web/lib/claim/finalize.ts',
    'C:/apps/web/lib/claim/finalize.ts',
    'apps/web//lib/claim/finalize.ts',
    'apps/web/./lib/claim/finalize.ts',
    'apps/web/../lib/claim/finalize.ts',
    'apps/web/.git/claim.ts',
    'apps/web/lib/secrets.ts',
    'apps/web/.env.local.ts',
    'apps/web/lib/claim/finalize.tsx',
  ];
  for (const path of unsafePaths) {
    assertCode('targets-held', () =>
      validateOfflinePolicy(
        policyBytes,
        changedTargets(manifest => {
          manifest.targets[0] = path;
        })
      )
    );
  }
});

test('DeepSec config cannot invoke a model while isolation proofs are outstanding', () => {
  const config = readFileSync(
    resolve(ROOT, 'scripts/security/deepsec/deepsec.config.ts'),
    'utf8'
  );
  assert.match(config, /^throw new Error\(/);
  assert.match(config, /DeepSec is disabled/);
});
