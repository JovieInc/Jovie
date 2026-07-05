/** Shared numeric ratchet core for lock_down and lock_up metrics. */
export const RATCHET_CORE_SCHEMA_VERSION = 1;
export const RATCHET_DIRECTIONS = Object.freeze({
  LOCK_DOWN: 'lock_down',
  LOCK_UP: 'lock_up',
});

const DIRECTIONS = new Set(Object.values(RATCHET_DIRECTIONS));
const isNumber = value =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isPositive = value => isNumber(value) && value > 0;
const isCount = value => Number.isInteger(value) && value >= 0;

export function normalizeMeasurement(measurement, fallbackSampleSize) {
  return typeof measurement === 'number'
    ? { value: measurement, sampleSize: fallbackSampleSize }
    : {
        value: measurement?.value,
        sampleSize: measurement?.sampleSize ?? fallbackSampleSize,
      };
}

export function activeWaiver(waiver, now = new Date()) {
  const until = waiver?.until ?? waiver?.expiresAt;
  const untilMs = typeof until === 'string' ? new Date(until).getTime() : NaN;
  return Number.isFinite(untilMs) && untilMs > now.getTime() ? waiver : null;
}

export function defaultRatchetPolicy(policy = {}) {
  return {
    marginFraction: 0,
    improveEpsilon: 0,
    minSampleSize: 0,
    waiver: null,
    ...policy,
  };
}

export function validateRatchetConfig(ratchet) {
  if (!ratchet || typeof ratchet !== 'object') {
    return { ok: false, errors: ['ratchet must be a JSON object'] };
  }
  const policy = defaultRatchetPolicy(ratchet.policy);
  const errors = [];
  if (ratchet.schemaVersion !== RATCHET_CORE_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${RATCHET_CORE_SCHEMA_VERSION}; got ${ratchet.schemaVersion}`
    );
  }
  if (typeof ratchet.dimension !== 'string' || ratchet.dimension.length === 0) {
    errors.push('dimension must be a non-empty string');
  }
  if (!DIRECTIONS.has(ratchet.direction)) {
    errors.push('direction must be "lock_down" or "lock_up"');
  }
  if (!isPositive(ratchet.baseline)) {
    errors.push('baseline must be a positive number');
  }
  if (!ratchet.policy || typeof ratchet.policy !== 'object') {
    errors.push('policy must be an object');
  }
  if (!isNumber(policy.marginFraction)) {
    errors.push('policy.marginFraction must be a non-negative number');
  }
  if (!isNumber(policy.improveEpsilon)) {
    errors.push('policy.improveEpsilon must be a non-negative number');
  }
  if (!isCount(policy.minSampleSize)) {
    errors.push('policy.minSampleSize must be a non-negative integer');
  }
  if (policy.waiver != null && typeof policy.waiver !== 'object') {
    errors.push('policy.waiver must be null or an object');
  }
  if (ratchet.sampleSize !== undefined && !isCount(ratchet.sampleSize)) {
    errors.push('sampleSize must be a non-negative integer when present');
  }
  return { ok: errors.length === 0, errors };
}

export function compareRatchet(measurement, ratchet, options = {}) {
  const validation = validateRatchetConfig(ratchet);
  if (!validation.ok) {
    throw new Error(`Invalid ratchet config: ${validation.errors.join('; ')}`);
  }
  const { value: measured, sampleSize } = normalizeMeasurement(
    measurement,
    ratchet.sampleSize
  );
  if (!isNumber(measured)) {
    throw new Error(
      `measurement value must be a non-negative number; got ${measured}`
    );
  }

  const policy = defaultRatchetPolicy(ratchet.policy);
  const lockDown = ratchet.direction === RATCHET_DIRECTIONS.LOCK_DOWN;
  const threshold =
    ratchet.baseline *
    (lockDown ? 1 + policy.marginFraction : 1 - policy.marginFraction);
  const withinThreshold = lockDown
    ? measured <= threshold
    : measured >= threshold;
  const headroom = lockDown ? threshold - measured : measured - threshold;
  const improvedBy = Math.max(
    0,
    lockDown
      ? (ratchet.baseline - measured) / ratchet.baseline
      : (measured - ratchet.baseline) / ratchet.baseline
  );
  const waiver = activeWaiver(policy.waiver, options.now);
  const enoughSamples =
    policy.minSampleSize === 0 ||
    (typeof sampleSize === 'number' && sampleSize >= policy.minSampleSize);

  let status = 'pass';
  let ok = withinThreshold;
  if (waiver) {
    status = 'waived';
    ok = true;
  } else if (!enoughSamples) {
    status = 'insufficient_data';
    ok = true;
  } else if (!withinThreshold) {
    status = 'regression';
    ok = false;
  } else if (improvedBy > policy.improveEpsilon) {
    status = 'improvement';
  }

  return {
    ok,
    status,
    direction: ratchet.direction,
    measured,
    baseline: ratchet.baseline,
    threshold,
    headroom,
    marginFraction: policy.marginFraction,
    improveEpsilon: policy.improveEpsilon,
    improvedBy,
    sampleSize,
    reason: status,
    ...(status === 'improvement' ? { proposeNewBaseline: measured } : {}),
    ...(waiver ? { waiver } : {}),
  };
}

export function isLooseningBaseline(nextBaseline, ratchet) {
  if (!isPositive(nextBaseline)) {
    throw new Error(
      `next baseline must be a positive number; got ${nextBaseline}`
    );
  }
  return ratchet.direction === RATCHET_DIRECTIONS.LOCK_DOWN
    ? nextBaseline > ratchet.baseline
    : nextBaseline < ratchet.baseline;
}

export function buildRatchetUpdate(ratchet, measurement, options = {}) {
  const validation = validateRatchetConfig(ratchet);
  if (!validation.ok)
    return { ok: false, errors: validation.errors, updated: null };
  const { value: baseline, sampleSize } = normalizeMeasurement(
    measurement,
    ratchet.sampleSize
  );
  if (!isPositive(baseline)) {
    return {
      ok: false,
      errors: [`next baseline must be a positive number; got ${baseline}`],
      updated: null,
    };
  }
  if (sampleSize !== undefined && !isCount(sampleSize)) {
    return {
      ok: false,
      errors: [`sampleSize must be a non-negative integer; got ${sampleSize}`],
      updated: null,
    };
  }
  if (!options.force && isLooseningBaseline(baseline, ratchet)) {
    return {
      ok: false,
      errors: ['refusing to loosen baseline'],
      updated: null,
    };
  }
  return {
    ok: true,
    errors: [],
    updated: {
      ...ratchet,
      baseline,
      sampleSize: sampleSize ?? ratchet.sampleSize ?? 0,
      updatedAt: (options.now ?? new Date()).toISOString(),
    },
  };
}
