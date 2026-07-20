export const INTEGRATION_TRAIN_LABEL = 'integration-train';
export const INTEGRATION_TRAIN_MAX_LINES = 2500;
export const INTEGRATION_TRAIN_MAX_FILES = 60;

const SOURCE_BLOCK_PATTERN =
  /<!--\s*integration-train-sources\s*\n([\s\S]*?)\n\s*-->/i;
const OMISSIONS_BLOCK_PATTERN =
  /<!--\s*integration-train-omissions\s*\n([\s\S]*?)\n\s*-->/i;
const SOURCE_LINE_PATTERN =
  /^-\s+https:\/\/github\.com\/JovieInc\/Jovie\/pull\/(\d+)\s+@\s+([0-9a-f]{40})\s*$/i;

function isSafeRepositoryPath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').includes('..')
  );
}

export function parseIntegrationTrainSourceSpecs(body) {
  const block = String(body ?? '').match(SOURCE_BLOCK_PATTERN)?.[1];
  if (!block) return [];

  const lines = block
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const specs = lines.map(line => {
    const match = line.match(SOURCE_LINE_PATTERN);
    if (!match) {
      throw new Error(
        'each integration-train source must be an exact Jovie PR URL followed by @ and its 40-character head SHA'
      );
    }
    return { number: Number(match[1]), headSha: match[2].toLowerCase() };
  });
  if (new Set(specs.map(spec => spec.number)).size !== specs.length) {
    throw new Error('integration-train sources must be unique');
  }
  return specs;
}

export function parseIntegrationTrainOmissions(body) {
  const block = String(body ?? '').match(OMISSIONS_BLOCK_PATTERN)?.[1];
  if (!block) return {};

  let parsed;
  try {
    parsed = JSON.parse(block);
  } catch {
    throw new Error('integration-train omissions must be valid JSON');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('integration-train omissions must be a JSON object');
  }
  const normalized = {};
  for (const [source, paths] of Object.entries(parsed)) {
    if (!/^\d+$/.test(source) || !Array.isArray(paths) || paths.length === 0) {
      throw new Error(
        'integration-train omissions must map source PR numbers to non-empty path arrays'
      );
    }
    if (!paths.every(isSafeRepositoryPath)) {
      throw new Error(
        'integration-train omission paths must be safe repository paths'
      );
    }
    if (new Set(paths).size !== paths.length) {
      throw new Error('integration-train omission paths must be unique');
    }
    normalized[source] = paths;
  }
  return normalized;
}

export function parseIntegrationTrainSources(body) {
  return parseIntegrationTrainSourceSpecs(body).map(spec => spec.number);
}

export async function verifyIntegrationTrainSourceCoverage({
  body,
  trainNumber,
  loadPull,
  loadFiles,
}) {
  const specs = parseIntegrationTrainSourceSpecs(body);
  const omissions = parseIntegrationTrainOmissions(body);
  if (specs.some(spec => spec.number === trainNumber)) {
    throw new Error(
      `integration train #${trainNumber} cannot list itself as a source PR`
    );
  }
  const sourceNumbers = new Set(specs.map(spec => String(spec.number)));
  const unknownOmissionSource = Object.keys(omissions).find(
    source => !sourceNumbers.has(source)
  );
  if (unknownOmissionSource) {
    throw new Error(
      `omissions reference undeclared source PR #${unknownOmissionSource}`
    );
  }

  const trainPaths = new Set(await loadFiles(trainNumber));
  const results = [];
  for (const spec of specs) {
    const pull = await loadPull(spec.number);
    const actualHead = String(pull?.head?.sha ?? '').toLowerCase();
    const headRepo = pull?.head?.repo?.full_name;
    if (headRepo !== 'JovieInc/Jovie' || actualHead !== spec.headSha) {
      throw new Error(
        `source PR #${spec.number} head identity mismatch: expected ${spec.headSha}, got ${headRepo ?? 'unknown'}@${actualHead || 'unknown'}`
      );
    }

    const sourcePaths = new Set(await loadFiles(spec.number));
    const omitted = new Set(omissions[String(spec.number)] ?? []);
    const invalidOmission = [...omitted].find(path => !sourcePaths.has(path));
    if (invalidOmission) {
      throw new Error(
        `source PR #${spec.number} omission is not changed by that PR: ${invalidOmission}`
      );
    }
    const absent = [...sourcePaths].filter(
      path => !trainPaths.has(path) && !omitted.has(path)
    );
    if (absent.length > 0) {
      throw new Error(
        `source PR #${spec.number} has ${absent.length} undeclared missing path(s): ${absent.join(', ')}`
      );
    }
    const covered = [...sourcePaths].filter(path => trainPaths.has(path));
    if (covered.length === 0) {
      throw new Error(
        `source PR #${spec.number} contributes no changed paths to the integration train`
      );
    }
    results.push({
      number: spec.number,
      headSha: spec.headSha,
      covered: covered.length,
      omitted: omitted.size,
      omissionPaths: [...omitted],
    });
  }
  return results;
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

  let sources;
  try {
    sources = parseIntegrationTrainSources(body);
    parseIntegrationTrainOmissions(body);
  } catch (error) {
    return {
      passed: false,
      policy: INTEGRATION_TRAIN_LABEL,
      capLines: INTEGRATION_TRAIN_MAX_LINES,
      capFiles: INTEGRATION_TRAIN_MAX_FILES,
      sources: [],
      reason:
        error instanceof Error ? error.message : 'invalid source metadata',
    };
  }
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
  if (!result.passed) {
    process.exitCode = 1;
  } else if (result.policy === INTEGRATION_TRAIN_LABEL) {
    const { execFileSync } = await import('node:child_process');
    const { appendFileSync } = await import('node:fs');
    const repo = process.env.REPO ?? process.env.GITHUB_REPOSITORY;
    const trainNumber = Number(process.env.PR);
    if (!repo || !Number.isInteger(trainNumber) || trainNumber <= 0) {
      throw new Error('integration-train source coverage requires REPO and PR');
    }
    const ghJson = (endpoint, paginate = false) =>
      JSON.parse(
        execFileSync(
          'gh',
          [
            'api',
            ...(paginate ? ['--paginate', '--slurp'] : []),
            `repos/${repo}/${endpoint}`,
          ],
          { encoding: 'utf8' }
        )
      );
    try {
      const coverage = await verifyIntegrationTrainSourceCoverage({
        body: process.env.PR_BODY,
        trainNumber,
        loadPull: number => ghJson(`pulls/${number}`),
        loadFiles: number =>
          ghJson(`pulls/${number}/files?per_page=100`, true)
            .flat()
            .map(file => file.filename),
      });
      const coverageSummary = coverage
        .map(item => {
          const omissionSummary = item.omissionPaths.length
            ? `; EXPLICIT OMISSIONS: ${item.omissionPaths.join(', ')}`
            : '';
          return `#${item.number}@${item.headSha.slice(0, 12)} (${item.covered} covered, ${item.omitted} omitted${omissionSummary})`;
        })
        .join('; ');
      console.log(`✅ source coverage verified: ${coverageSummary}`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\n✅ Source coverage verified: ${coverageSummary}\n`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'unknown source coverage error';
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\n> ❌ Source coverage failed: ${message}\n`
        );
      }
      throw error;
    }
  }
}
