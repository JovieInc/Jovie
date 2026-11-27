// Conservative subset of @sentry/warden@0.54.0 finalized --json JSONL.
// Verified against the published package's dist/cli/output/jsonl.js and
// dist/cli/main.js (renderFinalRunLogContent). Unknown shapes are never reused.
export const RESULT_FORMAT = 'warden-jsonl/chunk-v1';
const nonnegative = value => Number.isFinite(value) && value >= 0;
const integer = value => Number.isInteger(value) && value >= 0;

const levels = ['high', 'medium', 'low'];
const tokens = [
  'inputTokens',
  'outputTokens',
  'cacheReadInputTokens',
  'cacheCreationInputTokens',
  'cacheCreation5mInputTokens',
  'cacheCreation1hInputTokens',
  'webSearchRequests',
];
const location = value =>
  value &&
  typeof value.path === 'string' &&
  integer(value.startLine) &&
  value.startLine > 0 &&
  (value.endLine === undefined ||
    (integer(value.endLine) && value.endLine >= value.startLine));
function snippet(value) {
  return (
    value &&
    typeof value.path === 'string' &&
    (value.language === undefined || typeof value.language === 'string') &&
    ['startLine', 'endLine', 'targetStartLine', 'targetEndLine'].every(
      key => integer(value[key]) && value[key] > 0
    ) &&
    Array.isArray(value.lines) &&
    value.lines.every(
      line =>
        line &&
        integer(line.line) &&
        line.line > 0 &&
        typeof line.content === 'string' &&
        (line.highlighted === undefined ||
          typeof line.highlighted === 'boolean')
    )
  );
}
function finding(value) {
  if (
    !value ||
    !['id', 'title', 'description'].every(
      key => typeof value[key] === 'string'
    ) ||
    !levels.includes(value.severity)
  )
    return false;
  if (value.confidence !== undefined && !levels.includes(value.confidence))
    return false;
  if (
    value.verification !== undefined &&
    typeof value.verification !== 'string'
  )
    return false;
  if (value.elapsedMs !== undefined && !nonnegative(value.elapsedMs))
    return false;
  if (value.location !== undefined && !location(value.location)) return false;
  if (
    value.additionalLocations !== undefined &&
    (!Array.isArray(value.additionalLocations) ||
      !value.additionalLocations.every(location))
  )
    return false;
  return value.sourceSnippet === undefined || snippet(value.sourceSnippet);
}
function usage(value) {
  return (
    value &&
    integer(value.inputTokens) &&
    integer(value.outputTokens) &&
    nonnegative(value.costUSD) &&
    Object.keys(value).every(
      key => key === 'costUSD' || tokens.includes(key)
    ) &&
    tokens.every(key => value[key] === undefined || integer(value[key]))
  );
}
function equalUsage(total, parts) {
  return [...tokens, 'costUSD'].every(
    key =>
      Math.abs(
        (total[key] ?? 0) -
          parts.reduce((sum, part) => sum + (part[key] ?? 0), 0)
      ) <= (key === 'costUSD' ? 1e-8 : 0)
  );
}
function accounting(breakdown) {
  if (!breakdown || !usage(breakdown.total?.usage)) return null;
  const parts = [breakdown.scan, ...Object.values(breakdown.auxiliary ?? {})]
    .filter(Boolean)
    .map(entry => entry.usage);
  return parts.length &&
    parts.every(usage) &&
    equalUsage(breakdown.total.usage, parts)
    ? breakdown.total.usage
    : null;
}

export function parseReviewResult(output, expectedSkills) {
  try {
    const records = output
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    const summary = records.at(-1);
    if (
      summary?.type !== 'summary' ||
      !integer(summary.totalFindings) ||
      !Object.keys(summary.bySeverity ?? {}).every(level =>
        levels.includes(level)
      ) ||
      !['high', 'medium', 'low'].every(level =>
        integer(summary.bySeverity?.[level])
      ) ||
      typeof summary.run?.runId !== 'string' ||
      [
        'totalSkippedFiles',
        'totalFailedHunks',
        'totalFailedExtractions',
        'totalVerifierRejections',
      ].some(key => summary[key] !== undefined && !integer(summary[key])) ||
      (summary.failedSkills !== undefined &&
        (!Array.isArray(summary.failedSkills) ||
          !summary.failedSkills.every(value => typeof value === 'string'))) ||
      !Number.isFinite(Date.parse(summary.run.timestamp)) ||
      !nonnegative(summary.run.durationMs) ||
      typeof summary.run.cwd !== 'string'
    )
      return null;
    const chunks = records.slice(0, -1);
    if (
      !chunks.length ||
      !expectedSkills.length ||
      new Set(expectedSkills).size !== expectedSkills.length
    )
      return null;
    const groups = new Map();
    let findingCount = 0;
    let failed = Boolean(
      summary.error !== undefined ||
        summary.failedSkills?.length ||
        summary.totalFailedHunks ||
        summary.totalFailedExtractions ||
        summary.totalSkippedFiles
    );
    const requestedModels = new Set();
    const severityCounts = { high: 0, medium: 0, low: 0 };
    const componentTotals = [];
    for (const row of chunks) {
      if (
        row.schemaVersion !== 1 ||
        row.run?.runId !== summary.run.runId ||
        row.run?.timestamp !== summary.run.timestamp ||
        row.run?.cwd !== summary.run.cwd ||
        row.run?.durationMs !== summary.run.durationMs ||
        typeof row.chunk?.lineRange !== 'string' ||
        (row.model !== undefined && typeof row.model !== 'string') ||
        !expectedSkills.includes(row.skill) ||
        !['ok', 'error', 'skipped'].includes(row.status) ||
        !Array.isArray(row.findings) ||
        !row.findings.every(finding) ||
        !row.chunk ||
        typeof row.chunk.file !== 'string' ||
        !Number.isInteger(row.chunk.index) ||
        row.chunk.index < 1 ||
        !Number.isInteger(row.chunk.total) ||
        row.chunk.total < row.chunk.index ||
        !nonnegative(row.durationMs)
      )
        return null;
      if (
        row.status !== 'ok' ||
        row.error !== undefined ||
        row.skippedFiles !== undefined
      )
        failed = true;
      findingCount += row.findings.length;
      for (const item of row.findings) severityCounts[item.severity]++;
      componentTotals.push(accounting(row.usageBreakdown));
      if (row.chunk.file) {
        const key = JSON.stringify([row.skill, row.chunk.file]);
        const group = groups.get(key) || {
          total: row.chunk.total,
          indexes: new Set(),
        };
        if (
          group.total !== row.chunk.total ||
          group.indexes.has(row.chunk.index)
        )
          return null;
        group.indexes.add(row.chunk.index);
        groups.set(key, group);
      }
      // chunk.model is a requested SDK selector, not provider-response identity.
      const scan = row.usageBreakdown?.scan?.usage;
      if (
        typeof row.model === 'string' &&
        usage(scan) &&
        (scan.inputTokens > 0 || scan.outputTokens > 0)
      )
        requestedModels.add(row.model);
    }
    if (
      findingCount !== summary.totalFindings ||
      levels.some(
        level => severityCounts[level] !== summary.bySeverity[level]
      ) ||
      [...groups.values()].some(group => group.indexes.size !== group.total)
    )
      return null;
    // Require an actual analysis chunk for every configured skill. No-op runs,
    // dropped skills or errors must not certify a reusable completed review.
    if (
      expectedSkills.some(
        skill => !chunks.some(row => row.skill === skill && row.chunk.file)
      )
    )
      failed = true;
    const total = accounting(summary.usageBreakdown);
    const cost =
      total &&
      componentTotals.every(Boolean) &&
      equalUsage(total, componentTotals)
        ? total.costUSD
        : null;
    return {
      complete: !failed,
      findingCount,
      requestedModelsWithUsage: [...requestedModels],
      knownCostUsd: null,
      runtimeReportedCostUsd: cost,
      runId: summary.run.runId,
    };
  } catch {
    return null;
  }
}
