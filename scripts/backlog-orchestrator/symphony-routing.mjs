/** Deterministic, pre-lease routing for Symphony issues. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SYMPHONY_ROUTING_SCHEMA = 'symphony-routing/v1';
export const ROUTING_PREFIX = '<!-- symphony-routing/v1 -->';
export const ROUTING_SUFFIX = '<!--/symphony-routing-->';

const registry = JSON.parse(
  readFileSync(new URL('../hermes/config/model-registry.json', import.meta.url), 'utf8')
);
const MODEL_BY_ID = Object.freeze(
  Object.fromEntries(
    registry.models
      .filter(model => model.provider === 'codex')
      .map(model => [model.id, { model: model.model, capabilities: model.capabilities }])
  )
);

const TEXT = issue => `${issue?.title || ''} ${issue?.description || ''}`.toLowerCase();
const labels = issue => (issue?.labels?.nodes || issue?.labels || []).map(label =>
  String(typeof label === 'string' ? label : label?.name || '').toLowerCase()
);

export function classifySymphonyIssue(issue) {
  const text = `${TEXT(issue)} ${labels(issue).join(' ')}`;
  const rootCause = /\b(root cause|regression|incident|broken|failure|500|crash|debug)\b/.test(text);
  const architecture = /\b(architecture|orchestrat|control[- ]plane|fleet|routing|workflow|infra|migration|queue|system)\b/.test(text);
  const mechanical = /\b(typo|copy|docs?|readme|format|lint|rename|comment|mechanical|test[- ]only)\b/.test(text);
  const tests = /\b(test|fixture|vitest|pytest|coverage)\b/.test(text);
  const risk = /\b(auth|billing|payment|security|secret|token|webhook|database|migration|deploy|ci|production)\b/.test(text)
    ? 'high'
    : architecture || rootCause ? 'medium' : 'low';
  const complexity = architecture || rootCause ? 'high' : mechanical ? 'low' : 'standard';
  const capabilities = rootCause
    ? ['root-cause', 'architecture']
    : architecture
      ? ['architecture', 'code']
      : mechanical
        ? ['mechanical', 'code']
        : tests
          ? ['tests', 'code']
          : ['code'];
  return { risk, complexity, capabilities, reasons: [
    `capabilities=${capabilities.join(',')}`,
    `risk=${risk}`,
    `complexity=${complexity}`,
  ] };
}

function fingerprint(issue, classification) {
  return createHash('sha256')
    .update(JSON.stringify({ issue: issue?.identifier, title: issue?.title, classification }))
    .digest('hex').slice(0, 24);
}

export function selectSymphonyRoute({ issue, availableModels = MODEL_BY_ID, cooldowns = {}, now = Date.now() }) {
  const classification = classifySymphonyIssue(issue);
  const preferred = classification.capabilities.includes('root-cause')
    ? ['codex-sol', 'codex-terra']
    : classification.capabilities.includes('architecture')
      ? ['codex-terra', 'codex-sol']
      : ['codex-luna', 'codex-terra'];
  const candidates = [];
  for (const id of preferred) {
    const model = availableModels[id] || MODEL_BY_ID[id];
    if (!model || !model.capabilities.some(capability => classification.capabilities.includes(capability))) {
      candidates.push({ id, status: 'incompatible' });
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
      fingerprint: fingerprint(issue, classification),
    };
    return { status: 'selected', route };
  }
  return {
    status: 'blocked',
    reason: 'no-compatible-model-available',
    classification,
    candidates,
    fingerprint: fingerprint(issue, classification),
  };
}

export function buildRoutingReceipt(route) {
  return `${ROUTING_PREFIX}\n${JSON.stringify(route)}\n${ROUTING_SUFFIX}`;
}

export function parseRoutingReceipt(issue) {
  const comments = issue?.comments?.nodes || issue?.comments || [];
  for (const comment of comments) {
    const body = typeof comment === 'string' ? comment : comment?.body || '';
    const match = body.match(new RegExp(`${ROUTING_PREFIX}\\n(.*?)\\n${ROUTING_SUFFIX}`, 's'));
    if (!match) continue;
    try {
      const receipt = JSON.parse(match[1]);
      if (receipt.schema === SYMPHONY_ROUTING_SCHEMA && receipt.issue === issue.identifier && receipt.model) return receipt;
    } catch { /* malformed receipts are ignored and fail closed */ }
  }
  return null;
}

export { MODEL_BY_ID };
