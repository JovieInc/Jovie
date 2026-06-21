/** @type {const} */
export const QA_SWARM_RECIPE_IDS = [
  'diff-review',
  'explore',
  'vision-critique',
  'design-jury',
  'test-gen',
  'flaky-hunter',
];

/** @typedef {typeof QA_SWARM_RECIPE_IDS[number]} QaSwarmRecipeId */

/** @typedef {'P0' | 'P1' | 'P2'} QaFindingPriority */

/** @typedef {'objective' | 'taste' | 'flake' | 'coverage'} QaFindingKind */

/**
 * @typedef {object} QaSwarmFinding
 * @property {string} id
 * @property {QaSwarmRecipeId} recipeId
 * @property {string} title
 * @property {string} summary
 * @property {QaFindingPriority} priority
 * @property {QaFindingKind} kind
 * @property {readonly string[]} evidencePaths
 * @property {string} [reproduction]
 * @property {string} [surface]
 * @property {number} [polishScore]
 * @property {string} [referenceComp]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {object} QaSwarmProposeInput
 * @property {QaSwarmRecipeId} recipeId
 * @property {readonly QaSwarmFinding[]} findings
 * @property {string} [runId]
 * @property {string} [sourceIssue]
 * @property {string} [sourcePr]
 * @property {string} [branch]
 * @property {boolean} [dryRun]
 * @property {boolean} [eveEnabled]
 */

export const QA_FINDING_PRIORITIES = ['P0', 'P1', 'P2'];
export const QA_FINDING_KINDS = ['objective', 'taste', 'flake', 'coverage'];

const RECIPE_IDS = new Set(QA_SWARM_RECIPE_IDS);

function isOptionalString(value) {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value) {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  );
}

function isOptionalMetadata(value) {
  return (
    value === undefined ||
    (value !== null && typeof value === 'object' && !Array.isArray(value))
  );
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {unknown} value
 * @returns {value is QaSwarmFinding}
 */
export function isQaSwarmFinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const finding = /** @type {Record<string, unknown>} */ (value);
  return (
    isNonEmptyString(finding.id) &&
    RECIPE_IDS.has(/** @type {string} */ (finding.recipeId)) &&
    isNonEmptyString(finding.title) &&
    isNonEmptyString(finding.summary) &&
    QA_FINDING_PRIORITIES.includes(/** @type {string} */ (finding.priority)) &&
    QA_FINDING_KINDS.includes(/** @type {string} */ (finding.kind)) &&
    Array.isArray(finding.evidencePaths) &&
    finding.evidencePaths.every(path => typeof path === 'string') &&
    isOptionalString(finding.reproduction) &&
    isOptionalString(finding.surface) &&
    isOptionalNumber(finding.polishScore) &&
    isOptionalString(finding.referenceComp) &&
    isOptionalMetadata(finding.metadata)
  );
}

/**
 * @param {unknown} value
 * @returns {value is QaSwarmProposeInput}
 */
export function isQaSwarmProposeInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const input = /** @type {Record<string, unknown>} */ (value);
  return (
    RECIPE_IDS.has(/** @type {string} */ (input.recipeId)) &&
    Array.isArray(input.findings) &&
    input.findings.every(
      finding =>
        isQaSwarmFinding(finding) &&
        finding.recipeId === /** @type {string} */ (input.recipeId)
    )
  );
}

/**
 * @param {readonly QaSwarmFinding[]} findings
 */
export function assertFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    throw new Error('QA swarm propose requires at least one finding.');
  }

  for (const finding of findings) {
    if (!isQaSwarmFinding(finding)) {
      throw new Error(`Invalid QA swarm finding: ${JSON.stringify(finding)}`);
    }
  }
}
