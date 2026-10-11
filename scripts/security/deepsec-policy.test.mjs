import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DeepsecPolicyError,
  SECURITY_TARGETS,
  validatePolicy,
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

test('accepts only the pinned capped advisory gateway policy and nine targets', () => {
  const result = validatePolicy(policyBytes, targetsBytes);
  assert.equal(result.policy.modelAuth, 'gateway');
  assert.equal(result.policy.providerFallback, false);
  assert.ok(result.policy.gatewayTags.includes('security-scan'));
  assert.equal(result.policy.billing.route, 'ai-gateway');
  assert.equal(result.policy.billing.hardCap, true);
  assert.ok(result.policy.billing.monthlyCapUsd > 0);
  assert.equal(result.policy.billing.onUnknownPrice, 'skip');
  assert.equal(result.policy.models.cheap.gatewayId, 'zai/glm-5.3-flash');
  assert.equal(result.policy.execution.status, 'advisory');
  assert.equal(result.policy.execution.blocking, false);
  assert.equal(result.policy.execution.prCodeExecution, 'none');
  assert.deepEqual(result.targets, SECURITY_TARGETS);
  assert.equal(result.targets.length, 9);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.targets), true);
});

test('holds malformed UTF-8 and malformed JSON for either input', () => {
  assertCode('invalid-json', () =>
    validatePolicy(Buffer.from([0xff]), targetsBytes)
  );
  assertCode('invalid-json', () =>
    validatePolicy(Buffer.from('{'), targetsBytes)
  );
  assertCode('invalid-json', () =>
    validatePolicy(policyBytes, Buffer.from('{'))
  );
});

test('holds uncapped, blocking, fallback, or code-executing policy values before hash comparison', () => {
  const cases = [
    policy => {
      policy.schemaVersion = 1;
    },
    policy => {
      policy.projectId = 'other';
    },
    policy => {
      policy.maxTargets = 10;
    },
    policy => {
      policy.modelAuth = 'local';
    },
    policy => {
      policy.providerFallback = true;
    },
    policy => {
      policy.gatewayTags = [];
    },
    policy => {
      delete policy.gatewayTags;
    },
    policy => {
      policy.billing.route = 'direct';
    },
    policy => {
      policy.billing.hardCap = false;
    },
    policy => {
      policy.billing.monthlyCapUsd = 0;
    },
    policy => {
      policy.billing.monthlyCapUsd = Number.POSITIVE_INFINITY;
    },
    policy => {
      delete policy.billing.runCapUsd;
    },
    policy => {
      policy.billing.runCapUsd.pr = -1;
    },
    policy => {
      policy.billing.runCapUsd.frontier = policy.billing.monthlyCapUsd + 1;
    },
    policy => {
      delete policy.billing.runCapUsd.weekly;
    },
    policy => {
      policy.billing.minRunUsd = 0;
    },
    policy => {
      policy.billing.costSafetyFactor = 0.9;
    },
    policy => {
      policy.billing.prMaxFiles = 0;
    },
    policy => {
      policy.billing.prMaxFiles = 1.5;
    },
    policy => {
      policy.billing.onUnknownPrice = 'estimate';
    },
    policy => {
      delete policy.billing;
    },
    policy => {
      policy.execution.status = 'enabled';
    },
    policy => {
      delete policy.execution;
    },
    policy => {
      policy.execution.blocking = true;
    },
    policy => {
      policy.execution.prSources = 'any';
    },
    policy => {
      policy.execution.prCodeExecution = 'install';
    },
    policy => {
      policy.execution.dotenv = true;
    },
    // JOV-7119: a banned-provider cheap model fails closed before the hash check.
    policy => {
      policy.models.cheap.gatewayId = 'openai/gpt-6-luna';
    },
    policy => {
      delete policy.models;
    },
  ];
  for (const change of cases) {
    assertCode('policy-held', () =>
      validatePolicy(changedPolicy(change), targetsBytes)
    );
  }
});

test('accepts the disabled kill-switch state only as a reviewed policy change', () => {
  assertCode('policy-drift', () =>
    validatePolicy(
      changedPolicy(policy => {
        policy.execution.status = 'disabled';
      }),
      targetsBytes
    )
  );
});

test('rejects budget changes that were not reviewed into the pinned hash', () => {
  assertCode('policy-drift', () =>
    validatePolicy(
      changedPolicy(policy => {
        policy.billing.runCapUsd.pr = 1;
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
    assertCode('targets-held', () => validatePolicy(policyBytes, bytes));
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
      validatePolicy(
        policyBytes,
        changedTargets(manifest => {
          manifest.targets[0] = path;
        })
      )
    );
  }
});

test('DeepSec config refuses to load unless the policy is advisory', () => {
  const config = readFileSync(
    resolve(ROOT, 'scripts/security/deepsec/deepsec.config.ts'),
    'utf8'
  );
  assert.match(config, /execution\.status !== 'advisory'/);
  assert.match(config, /mode: 'local', provider: 'local'/);
  assert.match(config, /defaultAgent: 'codex'/);
  assert.doesNotMatch(config, /mode: 'gateway'|provider: 'vercel'/);
  assert.match(config, /DEEPSEC_SOURCE_ROOT/);
});
