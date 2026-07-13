export const INTEGRATION_TRAIN_LABEL = 'integration-train';
export const INTEGRATION_TRAIN_MAX_LINES = 2500;
export const INTEGRATION_TRAIN_MAX_FILES = 60;

const SOURCE_BLOCK_PATTERN =
  /<!--\s*integration-train-sources\s*\n([\s\S]*?)\n\s*-->/i;
const GITHUB_PR_PATTERN =
  /https:\/\/github\.com\/JovieInc\/Jovie\/pull\/(\d+)/gi;

export function parseIntegrationTrainSources(body) {
  const block = String(body ?? '').match(SOURCE_BLOCK_PATTERN)?.[1];
  if (!block) return [];

  return [
    ...new Set(
      [...block.matchAll(GITHUB_PR_PATTERN)].map(match => Number(match[1]))
    ),
  ];
}

export function evaluatePrSizePolicy({
  labels,
  body,
  lines,
  files,
  maxLines,
  maxFiles,
}) {
  if (
    ![lines, files, maxLines, maxFiles].every(
      value => Number.isFinite(value) && value >= 0
    )
  ) {
    return {
      passed: false,
      policy: 'invalid-input',
      capLines: maxLines,
      capFiles: maxFiles,
      sources: [],
      reason: 'size policy received invalid numeric input',
    };
  }
  const labelSet = new Set(labels);
  if (!labelSet.has(INTEGRATION_TRAIN_LABEL)) {
    const passed = lines <= maxLines && files <= maxFiles;
    return {
      passed,
      policy: 'standard',
      capLines: maxLines,
      capFiles: maxFiles,
      sources: [],
      reason: passed ? 'within standard size cap' : 'exceeds standard size cap',
    };
  }

  const sources = parseIntegrationTrainSources(body);
  if (sources.length < 2) {
    return {
      passed: false,
      policy: INTEGRATION_TRAIN_LABEL,
      capLines: INTEGRATION_TRAIN_MAX_LINES,
      capFiles: INTEGRATION_TRAIN_MAX_FILES,
      sources,
      reason:
        'integration-train requires a machine-readable source block with at least two unique Jovie PR links',
    };
  }

  const passed =
    lines <= INTEGRATION_TRAIN_MAX_LINES &&
    files <= INTEGRATION_TRAIN_MAX_FILES;
  return {
    passed,
    policy: INTEGRATION_TRAIN_LABEL,
    capLines: INTEGRATION_TRAIN_MAX_LINES,
    capFiles: INTEGRATION_TRAIN_MAX_FILES,
    sources,
    reason: passed
      ? `bounded integration train with ${sources.length} source PRs`
      : 'exceeds bounded integration-train size cap',
  };
}

function parseLabels(value) {
  return String(value ?? '')
    .split(',')
    .map(label => label.trim())
    .filter(Boolean);
}

if (process.argv[1]?.endsWith('/pr-size-guard-policy.mjs')) {
  const result = evaluatePrSizePolicy({
    labels: parseLabels(process.env.PR_LABELS),
    body: process.env.PR_BODY,
    lines: Number(process.env.PR_LINES),
    files: Number(process.env.PR_FILES),
    maxLines: Number(process.env.MAX_LINES),
    maxFiles: Number(process.env.MAX_FILES),
  });

  const sourceSummary = result.sources.length
    ? result.sources.map(source => `#${source}`).join(', ')
    : 'none';
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '### PR Size Guard',
        '',
        `Policy: **${result.policy}**`,
        '',
        '| metric (excl. generated/lock) | value | cap |',
        '|---|---|---|',
        `| changed lines | ${process.env.PR_LINES} | ${result.capLines} |`,
        `| changed files | ${process.env.PR_FILES} | ${result.capFiles} |`,
        `| component PRs | ${sourceSummary} | ${result.policy === INTEGRATION_TRAIN_LABEL ? '>=2' : 'n/a'} |`,
        '',
        result.passed ? `✅ ${result.reason}` : `> ❌ ${result.reason}`,
        '',
      ].join('\n')
    );
  }
  console.log(
    `${result.passed ? '✅' : '❌'} ${result.reason} (${process.env.PR_LINES} lines / ${process.env.PR_FILES} files; cap ${result.capLines}/${result.capFiles})`
  );
  if (!result.passed) process.exitCode = 1;
}
