import { createHash } from 'node:crypto';
import { extname, isAbsolute } from 'node:path';

export const MAX_TARGETS = 9;
export const SECURITY_TARGETS = Object.freeze([
  'apps/web/app/api/images/upload/route.ts',
  'apps/web/app/api/onboarding/claim/route.ts',
  'apps/web/app/api/stripe/webhooks/route.ts',
  'apps/web/lib/auth/better-auth.ts',
  'apps/web/lib/auth/cached.ts',
  'apps/web/lib/auth/require-auth.ts',
  'apps/web/lib/claim/finalize.ts',
  'apps/web/lib/entitlements/registry.ts',
  'apps/web/lib/entitlements/server.ts',
]);

const POLICY_SHA256 =
  '8c017016c339884e82e7f24d5596dfba646727dbe84508cd40885d6483a59cd2';
const EXCLUDED = new Set([
  '.git',
  '.deepsec',
  '.agents',
  '.claude',
  '.codex',
  'node_modules',
  'vendor',
  'dist',
  'build',
  '.next',
  '.vercel',
  'coverage',
  'generated',
  'fixtures',
  '__fixtures__',
]);
const SENSITIVE =
  /(?:^|[._-])(?:env|secret|secrets|credential|credentials|token|password|private[-_.]?key|service[-_.]?account|oauth|doppler)(?:[._-]|$)/i;

export class DeepsecPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeepsecPolicyError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new DeepsecPolicyError(code, message);
}

function decodeJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('invalid-json', label + ' must be valid UTF-8 JSON');
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeTarget(path, policy) {
  if (
    typeof path !== 'string' ||
    !path ||
    /\p{Cc}/u.test(path) ||
    path.includes('\\') ||
    isAbsolute(path) ||
    /^[A-Za-z]:/.test(path)
  )
    return false;
  const parts = path.split('/');
  const file = parts.at(-1);
  return (
    parts.every(part => part && part !== '.' && part !== '..') &&
    !parts.some(
      part =>
        EXCLUDED.has(part) ||
        policy.excludedPathSegments.includes(part) ||
        SENSITIVE.test(part)
    ) &&
    !/^\.env(?:\.|$)/i.test(file) &&
    policy.sourceExtensions.includes(extname(file).toLowerCase())
  );
}

const RUN_KINDS = ['pr', 'weekly', 'frontier'];

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function billingHeld(billing) {
  const caps = billing?.runCapUsd;
  return (
    billing?.route !== 'ai-gateway' ||
    billing.hardCap !== true ||
    !positive(billing.monthlyCapUsd) ||
    !caps ||
    !RUN_KINDS.every(
      kind => positive(caps[kind]) && caps[kind] <= billing.monthlyCapUsd
    ) ||
    !positive(billing.minRunUsd) ||
    !(billing.costSafetyFactor >= 1) ||
    !Number.isInteger(billing.prMaxFiles) ||
    billing.prMaxFiles < 1 ||
    billing.onUnknownPrice !== 'skip'
  );
}

export function validatePolicy(policyBytes, targetsBytes) {
  const policy = decodeJson(policyBytes, 'DeepSec policy');
  const execution = policy?.execution;
  if (
    policy?.schemaVersion !== 2 ||
    policy?.projectId !== 'jovie' ||
    policy.maxTargets !== MAX_TARGETS ||
    policy.modelAuth !== 'gateway' ||
    policy.providerFallback !== false ||
    !policy.gatewayTags?.includes('security-scan') ||
    billingHeld(policy.billing) ||
    !['disabled', 'advisory'].includes(execution?.status) ||
    execution.blocking !== false ||
    execution.prSources !== 'same-repo-only' ||
    execution.prCodeExecution !== 'none' ||
    execution.dotenv !== false
  )
    fail(
      'policy-held',
      'only the capped, advisory, fallback-free gateway policy is allowed'
    );
  if (sha256(policyBytes) !== POLICY_SHA256)
    fail(
      'policy-drift',
      'policy bytes differ from the reviewed gateway budget contract'
    );

  const manifest = decodeJson(targetsBytes, 'DeepSec target manifest');
  const paths = manifest?.targets;
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    Object.keys(manifest).length !== 4 ||
    manifest.schemaVersion !== 1 ||
    manifest.repository !== 'JovieInc/Jovie' ||
    manifest.maxTargets !== MAX_TARGETS ||
    !Array.isArray(paths) ||
    paths.length !== MAX_TARGETS ||
    paths.some(path => !safeTarget(path, policy)) ||
    JSON.stringify(paths) !== JSON.stringify(SECURITY_TARGETS)
  )
    fail(
      'targets-held',
      'target manifest must be exactly the reviewed nine safe Jovie paths'
    );
  return Object.freeze({ policy, targets: Object.freeze([...paths]) });
}
