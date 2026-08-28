/**
 * Optimization telemetry contract for user-facing Jovie outputs.
 * Invariant consumer: JOV-INV-012.
 *
 * Extends the existing analytics, model-experiment, audience-event,
 * YouTube-experiment, and release-to-revenue surfaces. This module does not
 * create a parallel analytics stack.
 */

export const OPTIMIZATION_CONTRACT_INVARIANT_ID = 'JOV-INV-012';

export const LEARNING_HIERARCHY = Object.freeze([
  'platform',
  'medium-or-channel',
  'country-or-locale',
  'genre-or-cohort',
  'artist-plus-career-era-or-lifecycle',
  'content-variant',
  'consented-audience-segment',
  'fan',
]);

export const EXISTING_TELEMETRY_SURFACES = Object.freeze([
  'analytics',
  'model-experiment',
  'audience-event',
  'youtube-experiment',
  'release-to-revenue',
]);

export const PRODUCT_CONTRACT_FIELDS = Object.freeze([
  'variantIdentity',
  'exposure',
  'outcome',
  'attribution',
  'contextDimensions',
  'hypothesis',
  'primaryMetric',
  'guardrails',
  'privacy',
  'optimizerOwner',
  'cadence',
  'decisionWriteback',
  'rollback',
]);

export const EXCEPTION_CLASSES = Object.freeze([
  'non-product',
  'non-optimizable',
]);

export const SPAWNED_OPTIMIZATION_CONTRACT_INSTRUCTION =
  'Satisfy the issue optimization contract (stable variant identity, exposure, outcome, attribution, eligible context dimensions, hypothesis and primary metric, guardrails, privacy and consent, optimizer owner and cadence, decision writeback, and rollback or control) using the existing analytics, model-experiment, audience event, YouTube experiment, and release-to-revenue surfaces. If the work is non-product or non-optimizable, explicitly declare a justified exception instead of omitting the contract.';

export const CONTROL_PLANE_OPTIMIZATION_EXCEPTION = Object.freeze({
  kind: 'exception',
  class: 'non-product',
  justification:
    'Control-plane plan, admission, or lease machinery with no user-facing page, link, asset, campaign, recommendation, or content variant.',
});

const INTERMEDIATE_ONLY_METRIC =
  /^(engagement|ctr|clicks?|impressions?|views?|raw engagement)$/i;

const FIELD_ALIASES = Object.freeze({
  variantidentity: 'variantIdentity',
  stablevariantidentity: 'variantIdentity',
  exposure: 'exposure',
  outcome: 'outcome',
  attribution: 'attribution',
  eligblecontextdimensions: 'contextDimensions',
  eligiblecontextdimensions: 'contextDimensions',
  contextdimensions: 'contextDimensions',
  hypothesis: 'hypothesis',
  primarymetric: 'primaryMetric',
  guardrails: 'guardrails',
  privacy: 'privacy',
  privacyandconsent: 'privacy',
  consent: 'privacy',
  optimizerowner: 'optimizerOwner',
  cadence: 'cadence',
  decisionwriteback: 'decisionWriteback',
  rollback: 'rollback',
  rollbackorcontrol: 'rollback',
  promotion: 'promotion',
  class: 'class',
  justification: 'justification',
  kind: 'kind',
});

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function listValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (hasText(value)) {
    return value
      .split(/,|;/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function telemetryHaystack(contract) {
  return [
    contract?.exposure,
    contract?.outcome,
    contract?.attribution,
    contract?.decisionWriteback,
  ]
    .filter(hasText)
    .join(' ')
    .toLowerCase();
}

function mentionsExistingSurface(contract) {
  const haystack = telemetryHaystack(contract);
  return EXISTING_TELEMETRY_SURFACES.some(surface =>
    haystack.includes(surface)
  );
}

function sectionHeader(line) {
  const markdown = /^#{2,3}\s+(.+?)\s*$/.exec(line);
  if (markdown) return { name: markdown[1].trim(), inline: '' };
  const bold = /^\s*\*\*([^*]+?)\*\*\s*(?:[—:-]\s*)?(.*)$/.exec(line);
  if (!bold) return null;
  return {
    name: bold[1].replace(/:\s*$/, '').trim(),
    inline: bold[2].trim(),
  };
}

function markdownSection(description, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  const lines = String(description || '').split('\n');
  const start = lines.findIndex(line => {
    const header = sectionHeader(line);
    return header && wanted.has(header.name.toLowerCase());
  });
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => {
    if (index <= start) return false;
    return Boolean(sectionHeader(line));
  });
  const inline = sectionHeader(lines[start])?.inline;
  return [inline, ...lines.slice(start + 1, end < 0 ? undefined : end)]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseMaybeJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const raw = fenced ? fenced[1] : text;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function labeledFields(text) {
  const fields = {};
  for (const line of String(text || '').split('\n')) {
    const match = /^\s*(?:[-*]|\d+[.)])?\s*([^:]+):\s*(.+)$/.exec(line);
    if (!match) continue;
    const alias = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    const key = FIELD_ALIASES[alias];
    if (!key) continue;
    fields[key] = match[2].trim();
  }
  return fields;
}

export function completeProductOptimizationContract(overrides = {}) {
  return {
    kind: 'product',
    variantIdentity: 'smart-link-cta:primary:v3',
    exposure: 'audience-event impression on the public smart-link',
    outcome: 'release-to-revenue GMV attributed to the variant',
    attribution: 'release-to-revenue plus analytics session',
    contextDimensions: [
      'platform',
      'medium-or-channel',
      'country-or-locale',
      'genre-or-cohort',
      'artist-plus-career-era-or-lifecycle',
      'content-variant',
    ],
    hypothesis:
      'A clearer primary CTA increases paid conversion without harming trust.',
    primaryMetric:
      'artist-business-outcome: paid conversion per eligible exposure',
    guardrails: ['complaint', 'trust', 'brand'],
    privacy:
      'first-party consented behavior only; no sensitive demographic inference or cross-platform identity stitching',
    optimizerOwner: 'Symphony',
    cadence: 'weekly decision with writeback',
    decisionWriteback: 'model-experiment promotion receipt',
    rollback:
      'revert to the control variant; do not auto-promote identity changes',
    promotion: 'bounded-reversible',
    ...overrides,
  };
}

/**
 * Return a stable reason when a contract is missing or invalid, else null.
 */
export function validateOptimizationContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return 'optimization-contract-missing';
  }
  if (contract.kind === 'exception') {
    if (!EXCEPTION_CLASSES.includes(contract.class)) {
      return 'optimization-exception-unjustified';
    }
    if (
      !hasText(contract.justification) ||
      contract.justification.trim().length < 24
    ) {
      return 'optimization-exception-unjustified';
    }
    return null;
  }
  if (contract.kind !== 'product') return 'optimization-contract-missing';

  const missing = PRODUCT_CONTRACT_FIELDS.find(field => {
    if (field === 'contextDimensions' || field === 'guardrails') {
      return listValue(contract[field]).length === 0;
    }
    return !hasText(contract[field]);
  });
  if (missing) return `optimization-contract-incomplete:${missing}`;
  if (!mentionsExistingSurface(contract)) {
    return 'optimization-contract-parallel-stack';
  }
  if (INTERMEDIATE_ONLY_METRIC.test(String(contract.primaryMetric).trim())) {
    return 'optimization-contract-intermediate-objective';
  }
  return null;
}

function parseException(text) {
  const json = parseMaybeJson(text);
  if (json?.kind === 'exception' || json?.class || json?.justification) {
    return {
      kind: 'exception',
      class: json.class || 'non-product',
      justification: json.justification || '',
    };
  }
  const fields = labeledFields(text);
  return {
    kind: 'exception',
    class: fields.class || 'non-product',
    justification: fields.justification || text.trim(),
  };
}

function parseProductContract(text) {
  const json = parseMaybeJson(text);
  if (json?.kind === 'product' || json?.variantIdentity) {
    return { kind: 'product', ...json };
  }
  const fields = labeledFields(text);
  if (fields.contextDimensions) {
    fields.contextDimensions = listValue(fields.contextDimensions);
  }
  if (fields.guardrails) {
    fields.guardrails = listValue(fields.guardrails);
  }
  return { kind: 'product', ...fields };
}

export function resolveOptimizationContract(issue) {
  const description = issue?.description || '';
  const exceptionText = markdownSection(description, [
    'Optimization exception',
    'Non-product exception',
    'Non-optimizable exception',
  ]);
  if (exceptionText) return parseException(exceptionText);

  const contractText = markdownSection(description, ['Optimization contract']);
  if (contractText) return parseProductContract(contractText);

  const identifier = issue?.identifier || 'unknown';
  return {
    kind: 'exception',
    class: 'non-product',
    justification: `Issue ${identifier} does not declare a user-facing page, link, asset, campaign, recommendation, or content variant, so this is a justified non-product exception.`,
  };
}
