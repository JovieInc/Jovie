const COUNT_METRICS = new Map([
  ['Files', 'files'],
  ['Lines of Library', 'linesOfLibrary'],
  ['Lines of Definitions', 'linesOfDefinitions'],
  ['Lines of TypeScript', 'linesOfTypeScript'],
  ['Lines of JavaScript', 'linesOfJavaScript'],
  ['Lines of JSON', 'linesOfJson'],
  ['Identifiers', 'identifiers'],
  ['Symbols', 'symbols'],
  ['Types', 'types'],
  ['Instantiations', 'instantiations'],
  ['Assignability cache size', 'assignabilityCacheSize'],
  ['Identity cache size', 'identityCacheSize'],
  ['Subtype cache size', 'subtypeCacheSize'],
  ['Strict subtype cache size', 'strictSubtypeCacheSize'],
]);

const TIME_METRICS = new Map([
  ['I/O Read time', 'ioReadSeconds'],
  ['I/O Write time', 'ioWriteSeconds'],
  ['Parse time', 'parseSeconds'],
  ['ResolveModule time', 'resolveModuleSeconds'],
  ['ResolveTypeReference time', 'resolveTypeReferenceSeconds'],
  ['ResolveLibrary time', 'resolveLibrarySeconds'],
  ['Program time', 'programSeconds'],
  ['Bind time', 'bindSeconds'],
  ['Check time', 'checkSeconds'],
  ['Transform time', 'transformSeconds'],
  ['comment time', 'commentSeconds'],
  ['printTime time', 'printSeconds'],
  ['Emit time', 'emitSeconds'],
  ['Total time', 'totalSeconds'],
]);

function finiteNumbers(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('samples must be an array');
  }
  const samples = values.map(Number);
  if (samples.some(value => !Number.isFinite(value))) {
    throw new TypeError('samples must contain only finite numbers');
  }
  return samples;
}

export function nearestRankPercentile(values, percentile) {
  const samples = finiteNumbers(values);
  if (samples.length === 0) return null;
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) {
    throw new RangeError('percentile must be greater than 0 and at most 100');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil((percentile / 100) * sorted.length) - 1];
}

export function calculateStatistics(values) {
  const samples = finiteNumbers(values);
  if (samples.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      variance: null,
      coefficientOfVariation: null,
      p50: null,
      p95: null,
    };
  }

  const mean =
    samples.reduce((total, value) => total + value, 0) / samples.length;
  const variance =
    samples.reduce((total, value) => total + (value - mean) ** 2, 0) /
    samples.length;

  return {
    count: samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
    mean,
    variance,
    coefficientOfVariation:
      mean === 0
        ? variance === 0
          ? 0
          : null
        : Math.sqrt(variance) / Math.abs(mean),
    p50: nearestRankPercentile(samples, 50),
    p95: nearestRankPercentile(samples, 95),
  };
}

export function parseExtendedDiagnostics(output) {
  const diagnostics = {};
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*([\d,.]+)\s*(K|M|G|s|ms)?\s*$/i);
    if (!match) continue;
    const [, label, rawValue, unit = ''] = match;
    const value = Number(rawValue.replaceAll(',', ''));
    if (!Number.isFinite(value)) continue;

    if (label === 'Memory used') {
      const multiplier =
        { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[unit.toUpperCase()] ?? 1;
      diagnostics.memoryBytes = value * multiplier;
      continue;
    }
    const countKey = COUNT_METRICS.get(label);
    if (countKey) diagnostics[countKey] = value;
    const timeKey = TIME_METRICS.get(label);
    if (timeKey)
      diagnostics[timeKey] = unit.toLowerCase() === 'ms' ? value / 1000 : value;
  }
  return diagnostics;
}

export function parseTimeOutput(output) {
  const result = {};
  const labels = new Map([
    ['real', 'realSeconds'],
    ['user', 'userSeconds'],
    ['sys', 'systemSeconds'],
    ['maximum resident set size', 'peakMemoryBytes'],
  ]);

  for (const line of String(output ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    const prefixedTime = trimmed.match(/^(real|user|sys)\s+([\d.]+)$/);
    if (prefixedTime) {
      const [, label, rawValue] = prefixedTime;
      const key = labels.get(label);
      result[key] = Number(rawValue);
      continue;
    }
    const elapsedPrefix = 'Elapsed (wall clock) time (h:mm:ss or m:ss):';
    if (trimmed.startsWith(elapsedPrefix)) {
      const parts = trimmed
        .slice(elapsedPrefix.length)
        .trim()
        .split(':')
        .map(Number);
      result.realSeconds = parts.reduce(
        (total, value) => total * 60 + value,
        0
      );
      continue;
    }

    const match = trimmed.match(/^([\d.]+)\s+(.+)$/);
    if (match) {
      const [, rawValue, label] = match;
      const key = labels.get(label.toLowerCase());
      const value = Number(rawValue);
      if (key && Number.isFinite(value)) result[key] = value;
      continue;
    }

    const gnuMatch = trimmed.match(/^([^:]+):\s*([\d.]+)(?:%|\s.*)?$/);
    if (!gnuMatch) continue;
    const [, label, rawValue] = gnuMatch;
    const normalized = label.toLowerCase();
    if (normalized === 'user time (seconds)')
      result.userSeconds = Number(rawValue);
    if (normalized === 'system time (seconds)')
      result.systemSeconds = Number(rawValue);
    if (normalized === 'maximum resident set size (kbytes)')
      result.peakMemoryBytes = Number(rawValue) * 1024;
  }
  return result;
}

export function aggregateScenarioResults(results) {
  if (!Array.isArray(results)) throw new TypeError('results must be an array');
  const durations = results.map(result => result.durationMs);
  const memory = results
    .map(result => result.peakMemoryBytes)
    .filter(value => Number.isFinite(value));
  const cpuUtilization = results
    .map(result => result.cpuUtilization)
    .filter(value => Number.isFinite(value));
  const cacheHitRate = results
    .map(result => result.cacheHitRate)
    .filter(value => Number.isFinite(value));

  return {
    sampleCount: results.length,
    durationMs: calculateStatistics(durations),
    peakMemoryBytes: memory.length === 0 ? null : Math.max(...memory),
    cpuUtilization: calculateStatistics(cpuUtilization),
    cacheHitRate:
      cacheHitRate.length === 0 ? null : calculateStatistics(cacheHitRate),
  };
}

export function isValidHistoricalScenario(
  scenario,
  allowedScenarioNames,
  minimumSamples = 10
) {
  const durations = scenario?.samples?.map(sample => sample.durationMs);
  const p95 = scenario?.aggregate?.durationMs?.p95;
  return (
    allowedScenarioNames.has(scenario?.name) &&
    Array.isArray(durations) &&
    durations.length >= minimumSamples &&
    durations.every(value => Number.isFinite(value) && value > 0) &&
    Number.isFinite(p95) &&
    p95 > 0 &&
    Math.abs(nearestRankPercentile(durations, 95) - p95) <= 1
  );
}

export function evaluatePerformanceConstraints({
  coefficientOfVariation,
  packages = {},
  peakMemoryBytes,
  memoryLimitBytes,
  targets,
  packageShareJustification = {},
  requiresPackageTelemetry = false,
  expectedSamples = 1,
  packageTelemetrySamples = Object.keys(packages).length > 0 ? 1 : 0,
  memoryTelemetrySamples = Number.isFinite(peakMemoryBytes) ? 1 : 0,
}) {
  const packageEntries = Object.entries(packages);
  const packageTelemetryPresent =
    packageTelemetrySamples === expectedSamples && expectedSamples > 0;
  const packageViolations = packageEntries
    .filter(
      ([name, stats]) =>
        stats.share > targets.maximumPackageShare &&
        !packageShareJustification[name]
    )
    .map(([name, stats]) => ({ name, share: stats.share }));
  const memoryTelemetryPresent =
    Number.isFinite(peakMemoryBytes) &&
    memoryTelemetrySamples === expectedSamples &&
    expectedSamples > 0;
  const memoryFraction = memoryTelemetryPresent
    ? peakMemoryBytes / memoryLimitBytes
    : null;
  return {
    variancePassed:
      coefficientOfVariation === null ||
      coefficientOfVariation <= targets.maximumCoefficientOfVariation,
    packageTelemetryPresent,
    packageTelemetrySamples,
    packageSharePassed:
      !requiresPackageTelemetry ||
      (packageTelemetryPresent && packageViolations.length === 0),
    packageViolations,
    memoryTelemetryPresent,
    memoryTelemetrySamples,
    memoryFraction,
    memoryPassed:
      memoryTelemetryPresent &&
      Number.isFinite(memoryLimitBytes) &&
      memoryLimitBytes > 0 &&
      memoryFraction <= targets.maximumMemoryFraction,
  };
}

export function selectRatchetBaseline(committedBaseline, rollingBaseline) {
  if (!Number.isFinite(committedBaseline) || committedBaseline <= 0) {
    throw new TypeError('committed baseline must be a positive finite number');
  }
  return Number.isFinite(rollingBaseline) && rollingBaseline > 0
    ? Math.min(committedBaseline, rollingBaseline)
    : committedBaseline;
}

export function evaluateRatchet({
  samples,
  baseline,
  absoluteTarget,
  warningRegression = 0.1,
  failureRegression = 0.2,
  minimumFailureSamples = 3,
  immediateFailureMultiplier = 1.25,
}) {
  const statistics = calculateStatistics(samples);
  const observed = statistics.p95;
  if (observed === null) {
    return { status: 'pass', regression: null, statistics, reasons: [] };
  }

  const reasons = [];
  const regression =
    Number.isFinite(baseline) && baseline > 0
      ? (observed - baseline) / baseline
      : null;
  if (
    Number.isFinite(absoluteTarget) &&
    observed > absoluteTarget * immediateFailureMultiplier
  ) {
    reasons.push('absolute-target-exceeded');
  }
  if (
    regression !== null &&
    regression > failureRegression &&
    statistics.count >= minimumFailureSamples
  ) {
    reasons.push('sustained-regression');
  }

  if (reasons.length > 0) {
    return { status: 'fail', regression, statistics, reasons };
  }
  if (regression !== null && regression > warningRegression) {
    reasons.push('regression-warning');
    return { status: 'warn', regression, statistics, reasons };
  }
  return { status: 'pass', regression, statistics, reasons };
}
