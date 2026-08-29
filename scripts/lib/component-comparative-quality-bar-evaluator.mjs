/** Source-blind rendered/behavioral observation evaluator for JOV-5438. */

import {
  COMPARATIVE_QUALITY_BAR,
  QUALITY_BAR_DIMENSIONS,
} from './component-comparative-quality-bar-registry.mjs';

const DIMENSION_SET = new Set(QUALITY_BAR_DIMENSIONS);
const BASELINE_BY_ID = new Map(
  COMPARATIVE_QUALITY_BAR.map(baseline => [baseline.id, baseline])
);

export const isComparativeObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = value =>
  typeof value === 'number' && Number.isFinite(value);
const asArray = value => (Array.isArray(value) ? value : []);
const missing = (required, actual) => {
  const actualSet = new Set(asArray(actual));
  return asArray(required).filter(value => !actualSet.has(value));
};
const finding = (dimension, code, detail) => ({ dimension, code, detail });

function equalBox(before, after) {
  if (!isComparativeObject(before) || !isComparativeObject(after)) return false;
  return ['x', 'y', 'width', 'height'].every(
    key =>
      isFiniteNumber(before[key]) &&
      isFiniteNumber(after[key]) &&
      before[key] === after[key]
  );
}

function evaluateDimension(baseline, dimension, observation) {
  const findings = [];
  const add = (code, detail) => findings.push(finding(dimension, code, detail));
  const requirements = baseline.requirements ?? {};
  if (!isComparativeObject(observation)) {
    add(
      'observation-missing',
      'observation is missing; applicable dimensions fail closed'
    );
    return findings;
  }

  if (dimension === 'semantic-anatomy') {
    const absentRoles = missing(requirements.roles, observation.roles);
    const absentSignals = missing(requirements.signals, observation.signals);
    if (absentRoles.length)
      add('roles-missing', `missing semantic roles: ${absentRoles.join(', ')}`);
    if (absentSignals.length)
      add(
        'signals-missing',
        `missing semantic signals: ${absentSignals.join(', ')}`
      );
    if (observation.accessibleNames !== true)
      add(
        'accessible-name-missing',
        'interactive semantics require accessible names'
      );
  }

  if (dimension === 'state-completeness') {
    const absentStates = missing(requirements.states, observation.states);
    if (absentStates.length)
      add('states-missing', `missing states: ${absentStates.join(', ')}`);
    if (observation.visibleFocus !== true)
      add('focus-not-visible', 'visible focus is not proved');
    if (observation.nonColorStateCue !== true)
      add('color-only-state', 'state must not rely on color alone');
    if (observation.reducedMotionSafe !== true)
      add('reduced-motion-unproved', 'reduced-motion behavior is not proved');
  }

  if (dimension === 'keyboard-discovery') {
    const absentKeys = missing(requirements.keys, observation.keys);
    const absentDiscovery = missing(
      requirements.discovery,
      observation.discovery
    );
    if (absentKeys.length)
      add('keys-missing', `missing keyboard paths: ${absentKeys.join(', ')}`);
    if (absentDiscovery.length)
      add(
        'discovery-missing',
        `missing discovery paths: ${absentDiscovery.join(', ')}`
      );
    for (const flag of [
      'collisionFree',
      'editableFieldSafe',
      'visibleFallback',
      'platformLabels',
    ]) {
      if (requirements[flag] === true && observation[flag] !== true) {
        add(`${flag}-required`, `${flag} is required`);
      }
    }
  }

  if (dimension === 'action-hierarchy') {
    const absentLevels = missing(
      requirements.actionLevels,
      observation.actionLevels
    );
    if (absentLevels.length)
      add(
        'action-levels-missing',
        `missing action levels: ${absentLevels.join(', ')}`
      );
    if (observation.distinguishable !== true)
      add(
        'action-levels-indistinguishable',
        'action levels are not distinguishable'
      );
    if (
      !Number.isInteger(observation.primaryCount) ||
      observation.primaryCount < 0
    ) {
      add('primary-count-unproved', 'primary action count is not proved');
    } else if (observation.primaryCount > requirements.maxPrimaryPerRegion) {
      add(
        'primary-overload',
        'more than one primary action is rendered in one region'
      );
    }
  }

  if (dimension === 'layout-stability') {
    if (
      requirements.stableControlBox === true &&
      !equalBox(observation.before, observation.after)
    ) {
      add(
        'control-box-changed',
        'control bounding box changed across the state transition'
      );
    }
    if (
      !isFiniteNumber(observation.unrelatedShiftPx) ||
      observation.unrelatedShiftPx < 0 ||
      observation.unrelatedShiftPx > (requirements.maxUnrelatedShiftPx ?? 0)
    ) {
      add(
        'unrelated-content-shifted',
        'unrelated content shifted across the state transition'
      );
    }
  }

  if (dimension === 'responsive-fit') {
    if (
      !isFiniteNumber(observation.viewportWidth) ||
      observation.viewportWidth <= 0 ||
      !isFiniteNumber(observation.documentScrollWidth) ||
      observation.documentScrollWidth < 0 ||
      observation.documentScrollWidth > observation.viewportWidth
    ) {
      add(
        'horizontal-overflow',
        'compact viewport has horizontal document overflow'
      );
    }
    if (requirements.minHitTargetPx) {
      if (!isFiniteNumber(observation.minHitTargetPx)) {
        add('hit-target-unproved', 'minimum hit target is not proved');
      } else if (observation.minHitTargetPx < requirements.minHitTargetPx) {
        add(
          'hit-target-small',
          `hit target is below ${requirements.minHitTargetPx}px`
        );
      }
    }
  }

  if (dimension === 'copy-density') {
    if (
      !Number.isInteger(observation.visibleWords) ||
      observation.visibleWords < 0
    ) {
      add('visible-word-count-unproved', 'visible word count is not proved');
    } else if (observation.visibleWords > requirements.maxVisibleWords) {
      add(
        'copy-density-exceeded',
        `visible copy exceeds ${requirements.maxVisibleWords} words`
      );
    }
    if (observation.repeatedMessages !== 0)
      add('copy-repeated', 'visible copy repeats the same message');
  }

  if (dimension === 'typography-rhythm') {
    const levels = asArray(observation.headingLevels);
    if (
      levels.length === 0 ||
      levels.some(
        level => !Number.isInteger(level) || level < 1 || level > 6
      ) ||
      levels.some((level, index) => index > 0 && level - levels[index - 1] > 1)
    ) {
      add('heading-rhythm-invalid', 'semantic heading rhythm skips a level');
    }
    if (!isFiniteNumber(observation.mobileBodyPx)) {
      add('mobile-body-unproved', 'mobile body size is not proved');
    } else if (observation.mobileBodyPx < requirements.minMobileBodyPx) {
      add(
        'mobile-body-small',
        `mobile body text is below ${requirements.minMobileBodyPx}px`
      );
    }
    if (!isFiniteNumber(observation.lineHeight)) {
      add('line-height-unproved', 'line height is not proved');
    } else if (observation.lineHeight < requirements.minLineHeight) {
      add(
        'line-height-small',
        `line height is below ${requirements.minLineHeight}`
      );
    }
    if (!isFiniteNumber(observation.measureCh) || observation.measureCh <= 0) {
      add('measure-unproved', 'measure is not proved');
    } else if (observation.measureCh > requirements.maxMeasureCh) {
      add('measure-wide', `measure exceeds ${requirements.maxMeasureCh}ch`);
    }
    if (observation.flowDirection !== requirements.flowDirection)
      add('flow-direction-invalid', 'block flow is not single-directional');
  }

  if (dimension === 'content-overflow') {
    if (
      !isFiniteNumber(observation.containerWidth) ||
      observation.containerWidth <= 0 ||
      !isFiniteNumber(observation.contentScrollWidth) ||
      observation.contentScrollWidth < 0 ||
      !isFiniteNumber(observation.documentOverflowPx) ||
      observation.documentOverflowPx !== 0 ||
      (observation.contentScrollWidth > observation.containerWidth &&
        observation.wideBlocksContained !== true)
    ) {
      add(
        'content-overflow',
        'long or wide content escapes its owning container'
      );
    }
  }

  if (dimension === 'append-stability') {
    if (
      typeof observation.beforeStyleHash !== 'string' ||
      observation.beforeStyleHash.length === 0 ||
      typeof observation.afterStyleHash !== 'string' ||
      observation.afterStyleHash.length === 0 ||
      observation.beforeStyleHash !== observation.afterStyleHash ||
      !isFiniteNumber(observation.priorBlockGeometryDeltaPx) ||
      observation.priorBlockGeometryDeltaPx !== 0
    ) {
      add(
        'append-restyled-or-moved',
        'appending content restyled or moved an earlier block'
      );
    }
  }

  return findings;
}

export function evaluateComparativeSample(sample) {
  if (
    !isComparativeObject(sample) ||
    typeof sample.id !== 'string' ||
    sample.id.length === 0
  ) {
    return {
      ok: false,
      findings: [
        finding('registry', 'sample-id-missing', 'sample requires an id'),
      ],
    };
  }
  const baseline = BASELINE_BY_ID.get(sample.baselineId);
  if (!baseline) {
    return {
      ok: false,
      findings: [
        finding(
          'registry',
          'baseline-unknown',
          `unknown baseline: ${sample.baselineId}`
        ),
      ],
    };
  }
  const observations = isComparativeObject(sample.observations)
    ? sample.observations
    : {};
  const findings = [];
  for (const dimension of Object.keys(observations)) {
    if (!DIMENSION_SET.has(dimension)) {
      findings.push(
        finding(
          'registry',
          'dimension-unknown',
          `unknown dimension: ${dimension}`
        )
      );
    }
  }
  for (const dimension of baseline.requiredDimensions) {
    findings.push(
      ...evaluateDimension(baseline, dimension, observations[dimension])
    );
  }
  return { ok: findings.length === 0, findings };
}

export function validateDimensionRequirements(baseline, dimension) {
  const requirements = isComparativeObject(baseline.requirements)
    ? baseline.requirements
    : {};
  const issue = detail => `${baseline.id}: ${dimension} ${detail}`;
  const issues = [];
  const requireArray = field => {
    if (!Array.isArray(requirements[field]) || requirements[field].length === 0)
      issues.push(issue(`requires a non-empty ${field} array`));
  };
  const requirePositiveNumber = field => {
    if (!isFiniteNumber(requirements[field]) || requirements[field] <= 0)
      issues.push(issue(`requires a positive ${field}`));
  };

  if (dimension === 'semantic-anatomy') requireArray('roles');
  if (dimension === 'state-completeness') requireArray('states');
  if (
    dimension === 'keyboard-discovery' &&
    asArray(requirements.keys).length === 0 &&
    asArray(requirements.discovery).length === 0
  ) {
    issues.push(issue('requires keys or discovery paths'));
  }
  if (dimension === 'action-hierarchy') {
    requireArray('actionLevels');
    if (
      !Number.isInteger(requirements.maxPrimaryPerRegion) ||
      requirements.maxPrimaryPerRegion < 1
    ) {
      issues.push(issue('requires a positive maxPrimaryPerRegion'));
    }
  }
  if (dimension === 'layout-stability') {
    if (requirements.stableControlBox !== true)
      issues.push(issue('requires stableControlBox=true'));
    if (
      !isFiniteNumber(requirements.maxUnrelatedShiftPx) ||
      requirements.maxUnrelatedShiftPx < 0
    ) {
      issues.push(issue('requires a non-negative maxUnrelatedShiftPx'));
    }
  }
  if (dimension === 'copy-density') requirePositiveNumber('maxVisibleWords');
  if (dimension === 'typography-rhythm') {
    requirePositiveNumber('minMobileBodyPx');
    requirePositiveNumber('minLineHeight');
    requirePositiveNumber('maxMeasureCh');
    if (typeof requirements.flowDirection !== 'string')
      issues.push(issue('requires flowDirection'));
  }
  if (
    dimension === 'responsive-fit' &&
    requirements.minHitTargetPx !== undefined
  ) {
    requirePositiveNumber('minHitTargetPx');
  }
  return issues;
}
