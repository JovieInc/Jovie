// JOV-INV-029: one executable PR delivery lifecycle contract.
// The invariant registry is the authority; this validator binds its policy to
// the existing workflow, receipt state machine, promotion writer, queue, and
// activation owners. It does not add a controller or polling loop.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedHere } from './registry.mjs';

export const PR_LIFECYCLE_INVARIANT_ID = 'JOV-INV-029';
export const PR_LIFECYCLE_SCHEMA = 'jovie-pr-lifecycle/v1';
export const READY_FOR_REVIEW_SUBSCRIBER =
  '.github/workflows/auto-merge-default.yml';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const REQUIRED_PHASES = Object.freeze([
  ['draft', 'symphony', 'draft-pr'],
  ['review', 'writer', 'ci-pending'],
  ['promotion', 'writer', 'queue-pending'],
  ['merge', 'github-native-merge-queue', 'merged'],
  ['activation', 'production-controller', 'production-proven'],
  ['closure', 'summer', 'issue-closed'],
]);

const REQUIRED_BINDINGS = Object.freeze([
  // Symphony's workflow lives in JovieInc/symphony-control and is verified there.
  [
    'scripts/symphony/WORKFLOW.md',
    'jovie-pr-lifecycle/v1',
    'JovieInc/symphony-control',
  ],
  ['scripts/backlog-orchestrator/delivery-state-machine.mjs', 'JOV-INV-029'],
  ['scripts/lib/writer-owned-pr-promotion.mjs', 'JOV-INV-029'],
  ['scripts/native-merge-intent.mjs', 'JOV-INV-029'],
  ['.github/workflows/production-controller.yml', 'JOV-INV-029'],
  ['docs/PR_FLOW.md', 'JOV-INV-029'],
]);

export function workflowDeclaresReadyForReviewType(source) {
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)types:\s*(.*?)\s*$/);
    if (!match) continue;

    const indentation = match[1].length;
    const declaration = [match[2].replace(/\s+#.*$/, '')];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      const nextIndentation = line.match(/^\s*/)?.[0].length ?? 0;
      if (nextIndentation <= indentation) break;
      declaration.push(line.replace(/\s+#.*$/, '').trim());
    }

    if (/\bready_for_review\b/.test(declaration.join(' '))) return true;
  }
  return false;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function contractFromRegistry(registry) {
  return (
    registry?.invariants?.find(item => item?.id === PR_LIFECYCLE_INVARIANT_ID)
      ?.policy?.value ?? null
  );
}

export function policyDigest(contract) {
  return createHash('sha256').update(stable(contract)).digest('hex');
}

export function validatePrLifecycleContract(
  registry,
  {
    repoRoot = ROOT,
    readFile = path => readFileSync(resolve(repoRoot, path), 'utf8'),
  } = {}
) {
  const errors = [];
  const contract = contractFromRegistry(registry);
  if (!contract)
    return [`pr-lifecycle-contract-missing: ${PR_LIFECYCLE_INVARIANT_ID}`];
  if (contract.schema !== PR_LIFECYCLE_SCHEMA)
    errors.push(`pr-lifecycle-schema: expected ${PR_LIFECYCLE_SCHEMA}`);
  const phases = Array.isArray(contract.phases) ? contract.phases : [];
  for (const [name, owner, exit] of REQUIRED_PHASES) {
    const phase = phases.find(item => item?.name === name);
    if (!phase) {
      errors.push(`pr-lifecycle-phase-missing: ${name}`);
      continue;
    }
    if (phase.owner !== owner) errors.push(`pr-lifecycle-owner:${name}`);
    if (phase.exit !== exit) errors.push(`pr-lifecycle-exit:${name}`);
    for (const field of ['entry', 'next', 'deadline', 'receipt'])
      if (typeof phase[field] !== 'string' || !phase[field].trim())
        errors.push(`pr-lifecycle-${field}:${name}`);
  }
  if (contract.draftIsCompletion === true)
    errors.push('pr-lifecycle-draft-is-completion');
  if (contract.mergeProvesActivation === true)
    errors.push('pr-lifecycle-merge-proves-activation');
  if (contract.onlyDispatchExclusion !== 'no-symphony')
    errors.push('pr-lifecycle-dispatch-exclusion');
  const ready = contract.readyForReview;
  if (ready?.soleSubscriber !== READY_FOR_REVIEW_SUBSCRIBER)
    errors.push('pr-lifecycle-ready-for-review-subscriber');
  if (ready?.restartsCi !== false)
    errors.push('pr-lifecycle-ready-for-review-restarts-ci');
  if (ready?.skipsDrafts !== true)
    errors.push('pr-lifecycle-ready-for-review-draft-skip');
  if (ready?.soleSubscriber === READY_FOR_REVIEW_SUBSCRIBER) {
    let subscriber = '';
    try {
      subscriber = readFile(READY_FOR_REVIEW_SUBSCRIBER);
    } catch {
      errors.push(
        `pr-lifecycle-ready-for-review-missing:${READY_FOR_REVIEW_SUBSCRIBER}`
      );
    }
    if (!workflowDeclaresReadyForReviewType(subscriber))
      errors.push('pr-lifecycle-ready-for-review-trigger');
    if (!subscriber.includes('github.event.pull_request.draft == false'))
      errors.push('pr-lifecycle-ready-for-review-draft-guard');

    let names = [];
    try {
      names = readdirSync(resolve(repoRoot, '.github/workflows'));
    } catch {
      errors.push('pr-lifecycle-ready-for-review-workflows-missing');
    }
    for (const name of names) {
      if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
      if (name === 'auto-merge-default.yml') continue;
      let source = '';
      try {
        source = readFile(`.github/workflows/${name}`);
      } catch {
        errors.push(`pr-lifecycle-ready-for-review-unreadable:${name}`);
        continue;
      }
      if (workflowDeclaresReadyForReviewType(source))
        errors.push(`pr-lifecycle-ready-for-review-extra:${name}`);
    }
  }
  for (const [path, marker, repo] of REQUIRED_BINDINGS) {
    if (!ownedHere({ repo })) continue;
    let source;
    try {
      source = readFile(path);
    } catch {
      errors.push(`pr-lifecycle-binding-missing:${path}`);
      continue;
    }
    if (!source.includes(marker))
      errors.push(`pr-lifecycle-binding:${path}:${marker}`);
  }
  return errors;
}

export function readPrLifecycleContract(repoRoot = ROOT) {
  const rows = readFileSync(resolve(repoRoot, 'canon/invariants.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
  return contractFromRegistry({ invariants: rows.slice(1) });
}
