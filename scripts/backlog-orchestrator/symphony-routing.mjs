/** Deterministic, pre-lease routing for Symphony issues. */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

export const SYMPHONY_ROUTING_SCHEMA = 'symphony-routing/v1';
export const ROUTING_PREFIX = '<!-- symphony-routing/v1 -->';
export const ROUTING_SUFFIX = '<!--/symphony-routing-->';

const registry = JSON.parse(
  readFileSync(
    new URL('../hermes/config/model-registry.json', import.meta.url),
    'utf8'
  )
);
const MODEL_BY_ID = Object.freeze(
  Object.fromEntries(
    registry.models
      .filter(model => model.provider === 'codex')
      .map(model => [
        model.id,
        { model: model.model, capabilities: model.capabilities },
      ])
  )
);

const TEXT = issue =>
  `${issue?.title || ''} ${issue?.description || ''}`.toLowerCase();
const labels = issue =>
  (issue?.labels?.nodes || issue?.labels || []).map(label =>
    String(typeof label === 'string' ? label : label?.name || '').toLowerCase()
  );

export function classifySymphonyIssue(issue) {
  const text = `${TEXT(issue)} ${labels(issue).join(' ')}`;
  const rootCause =
    /\b(root cause|regression|incident|broken|failure|500|crash|debug)\b/.test(
      text
    );
  const architecture =
    /\b(architecture|orchestrat|control[- ]plane|fleet|routing|workflow|infra|migration|queue|system)\b/.test(
      text
    );
  const mechanical =
    /\b(typo|copy|docs?|readme|format|lint|rename|comment|mechanical|test[- ]only)\b/.test(
      text
    );
  const tests = /\b(test|fixture|vitest|pytest|coverage)\b/.test(text);
  const risk =
    /\b(auth|billing|payment|security|secret|token|webhook|database|migration|deploy|ci|production)\b/.test(
      text
    )
      ? 'high'
      : architecture || rootCause
        ? 'medium'
        : 'low';
  const complexity =
    architecture || rootCause ? 'high' : mechanical ? 'low' : 'standard';
  const capabilities = rootCause
    ? ['root-cause', 'architecture']
    : architecture
      ? ['architecture', 'code']
      : mechanical
        ? ['mechanical', 'code']
        : tests
          ? ['tests', 'code']
          : ['code'];
  return {
    risk,
    complexity,
    capabilities,
    reasons: [
      `capabilities=${capabilities.join(',')}`,
      `risk=${risk}`,
      `complexity=${complexity}`,
    ],
  };
}

function fingerprint(issue, classification) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        issue: issue?.identifier,
        title: issue?.title,
        classification,
      })
    )
    .digest('hex')
    .slice(0, 24);
}

function preferredModels(classification) {
  return classification.capabilities.includes('root-cause')
    ? ['codex-sol', 'codex-terra']
    : classification.capabilities.includes('architecture')
      ? ['codex-terra', 'codex-sol']
      : ['codex-luna', 'codex-terra'];
}

function capacityEvidence(capacity) {
  if (capacity === undefined) return undefined;
  if (!capacity) return { accounts: 0, ready: 0, readable: false };
  return {
    accounts: capacity.accounts,
    ready: capacity.ready,
    active: capacity.active || null,
    readable: true,
  };
}

export function selectSymphonyRoute({
  issue,
  availableModels = MODEL_BY_ID,
  cooldowns = {},
  now = Date.now(),
  capacity = undefined,
}) {
  const classification = classifySymphonyIssue(issue);
  const preferred = preferredModels(classification);
  const capacityBlocked =
    capacity !== undefined && (!capacity || capacity.accounts === 0);
  const candidates = [];
  for (const id of preferred) {
    const model = availableModels[id] || MODEL_BY_ID[id];
    if (
      !model ||
      !model.capabilities.some(capability =>
        classification.capabilities.includes(capability)
      )
    ) {
      candidates.push({ id, status: 'incompatible' });
      continue;
    }
    if (capacityBlocked) {
      candidates.push({ id, status: 'unavailable', reason: 'codex-capacity' });
      continue;
    }
    const until = Number(cooldowns[id] || 0);
    if (until > now) {
      candidates.push({ id, status: 'cooldown', until });
      continue;
    }
    if (model.available === false) {
      candidates.push({ id, status: 'unavailable' });
      continue;
    }
    const route = {
      schema: SYMPHONY_ROUTING_SCHEMA,
      issue: issue.identifier,
      modelId: id,
      model: model.model,
      escalation: id !== preferred[0],
      fallback: id !== preferred[0] ? 'cooldown-or-unavailable fallback' : null,
      classification,
      candidates,
      capacity: capacityEvidence(capacity),
      fingerprint: fingerprint(issue, classification),
    };
    return { status: 'selected', route };
  }
  return {
    status: 'blocked',
    reason: 'no-compatible-model-available',
    classification,
    candidates,
    capacity: capacityEvidence(capacity),
    fingerprint: fingerprint(issue, classification),
  };
}

export function buildRoutingReceipt(route) {
  return `${ROUTING_PREFIX}\n${JSON.stringify(route)}\n${ROUTING_SUFFIX}`;
}

export function parseRoutingReceipt(issue) {
  const comments = issue?.comments?.nodes || issue?.comments || [];
  let latest = null;
  for (const comment of comments) {
    const body = typeof comment === 'string' ? comment : comment?.body || '';
    const match = body.match(
      new RegExp(`${ROUTING_PREFIX}\\n(.*?)\\n${ROUTING_SUFFIX}`, 's')
    );
    if (!match) continue;
    try {
      const receipt = JSON.parse(match[1]);
      if (
        receipt.schema === SYMPHONY_ROUTING_SCHEMA &&
        receipt.issue === issue.identifier &&
        receipt.model
      )
        latest = receipt;
    } catch {
      /* malformed receipts are ignored and fail closed */
    }
  }
  return latest;
}

export { MODEL_BY_ID };

/**
 * Read codex-rotate account capacity (accounts root + state.json cooldowns).
 * Returns null when the state is unreadable so callers can fail closed.
 */
export function readCodexRotateCapacity({
  accountsRoot = process.env.CODEX_ACCOUNTS_ROOT ||
    join(homedir(), '.codex-accounts'),
  statePath = process.env.CODEX_ACCOUNTS_STATE ||
    join(accountsRoot, 'state.json'),
  now = Date.now(),
} = {}) {
  try {
    const accounts = readdirSync(accountsRoot, { withFileTypes: true })
      .filter(
        entry =>
          entry.isDirectory() &&
          existsSync(join(accountsRoot, entry.name, 'auth.json'))
      )
      .map(entry => entry.name);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const cooldowns = state.cooldowns || {};
    const nowSeconds = Math.floor(now / 1000);
    const ready = accounts.filter(
      name => Number(cooldowns[name] || 0) <= nowSeconds
    );
    return {
      accounts: accounts.length,
      ready: ready.length,
      active: state.active || null,
      cooldowns,
    };
  } catch {
    return null;
  }
}

/**
 * Semantically verify a durable routing receipt: reconstruct the canonical
 * route from the current issue text plus the registry and reject any drift
 * in classification, model, escalation, or fingerprint. Returns the receipt
 * when valid, otherwise null.
 */
export function verifyRoutingReceipt(
  issue,
  { availableModels = MODEL_BY_ID, requireCapacityEvidence = false } = {}
) {
  const receipt = parseRoutingReceipt(issue);
  if (!receipt) return null;
  const classification = classifySymphonyIssue(issue);
  if (
    receipt.fingerprint !== fingerprint(issue, classification) ||
    JSON.stringify(receipt.classification) !== JSON.stringify(classification)
  )
    return null;
  const preferred = preferredModels(classification);
  if (!preferred.includes(receipt.modelId)) return null;
  const entry =
    availableModels[receipt.modelId] || MODEL_BY_ID[receipt.modelId];
  if (!entry || entry.model !== receipt.model) return null;
  if (
    !entry.capabilities.some(capability =>
      classification.capabilities.includes(capability)
    )
  )
    return null;
  if (receipt.escalation !== (receipt.modelId !== preferred[0])) return null;
  const candidates = Array.isArray(receipt.candidates)
    ? receipt.candidates
    : null;
  if (
    !candidates ||
    candidates.some(
      candidate =>
        !candidate ||
        typeof candidate.id !== 'string' ||
        !['incompatible', 'cooldown', 'unavailable'].includes(candidate.status)
    ) ||
    candidates.some(candidate => candidate.id === receipt.modelId)
  )
    return null;
  if (requireCapacityEvidence && typeof receipt.capacity !== 'object')
    return null;
  return receipt;
}

/**
 * Atomically bind a verified receipt into a Symphony workspace so the
 * launcher reads workspace-local evidence instead of trusting the network.
 */
export function materializeRoutingReceipt(issue, workspaceDir, options = {}) {
  const receipt = verifyRoutingReceipt(issue, options);
  if (!receipt) return null;
  mkdirSync(workspaceDir, { recursive: true });
  const target = join(workspaceDir, '.symphony-routing.json');
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, target);
  return { path: target, receipt };
}

const EXIT_CONFIG = 78;

async function runLauncher(argv) {
  const flag = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const workspace =
    flag('--workspace') || process.env.SYMPHONY_WORKSPACE || process.cwd();
  const issueArg =
    flag('--issue') ||
    process.env.SYMPHONY_ISSUE_IDENTIFIER ||
    basename(workspace);
  const fail = message => {
    console.error(`symphony-routing launch: ${message}`);
    process.exit(EXIT_CONFIG);
  };
  let issue;
  if (process.env.SYMPHONY_ROUTING_ISSUE_FILE) {
    issue = JSON.parse(
      readFileSync(process.env.SYMPHONY_ROUTING_ISSUE_FILE, 'utf8')
    );
  } else {
    const { fetchIssue } = await import('./linear-client.mjs');
    issue = await fetchIssue(issueArg).catch(error => fail(error.message));
  }
  if (!issue) fail(`issue not found: ${issueArg}`);
  const capacity = readCodexRotateCapacity();
  if (!capacity || capacity.accounts === 0)
    fail('codex-rotate capacity is unavailable; refusing to route');
  const materialized = materializeRoutingReceipt(issue, workspace, {
    requireCapacityEvidence: true,
  });
  if (!materialized)
    fail(`no valid symphony-routing/v1 receipt for ${issue.identifier}`);
  process.stdout.write(`${materialized.receipt.model}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`, 'file:').href
) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'launch') {
    await runLauncher(argv);
  } else {
    console.error(
      'usage: symphony-routing.mjs launch --workspace DIR [--issue ID]'
    );
    process.exit(EXIT_CONFIG);
  }
}
