import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeDiff } from './review-route.mjs';

const PREFIX = 'jovie.code-review-';
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const record = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, name) =>
  check(
    typeof value === 'string' && value.trim().length > 0,
    `${name} required`
  );
const sha = value =>
  check(
    /^[a-f0-9]{40}$/u.test(value ?? ''),
    'full immutable revision SHA required'
  );
const id = value =>
  check(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(value ?? ''), 'safe id required');
const path = value =>
  check(
    typeof value === 'string' &&
      value.length > 0 &&
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.split('/').some(p => p === '..' || p === '.' || !p),
    'repository relative path required'
  );
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonical(value[key])])
    );
  return value;
}
export const digest = value =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) =>
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
function location(value) {
  path(value.path);
  check(
    Number.isInteger(value.startLine) &&
      value.startLine > 0 &&
      Number.isInteger(value.endLine) &&
      value.endLine >= value.startLine,
    'valid location required'
  );
}
function unique(values, field) {
  check(new Set(values).size === values.length, `duplicate ${field}`);
}
function validateInput(input) {
  id(input.id);
  text(input.source?.repository, 'repository');
  check(
    Number.isInteger(input.source.originalPr) && input.source.originalPr > 0,
    'originalPr required'
  );
  sha(input.source.baseSha);
  sha(input.source.headSha);
  text(input.diff, 'original diff');
  check(
    Array.isArray(input.context) && input.context.length > 0,
    'surrounding context required'
  );
  unique(
    input.context.map(file => `${file.path}@${file.revisionSha}`),
    'context'
  );
  for (const file of input.context) {
    path(file.path);
    sha(file.revisionSha);
    check(
      [input.source.headSha, input.source.baseSha].includes(file.revisionSha),
      'context must come from original head/base'
    );
    check(typeof file.content === 'string', 'context content required');
  }
}
function validateAnswer(answer) {
  check(
    answer?.scope === 'listed-defects-only',
    'answer scope must be listed-defects-only'
  );
  sha(answer.verification?.fixSha);
  text(answer.verification.evidenceUrl, 'verification evidence');
  text(answer.verification.rationale, 'verification rationale');
  check(Array.isArray(answer.defects), 'verified defects required');
  unique(
    answer.defects.map(defect => defect.id),
    'defect'
  );
  for (const defect of answer.defects) {
    id(defect.id);
    location(defect);
    if (defect.allowedLocations !== undefined) {
      check(
        Array.isArray(defect.allowedLocations) &&
          defect.allowedLocations.length > 0,
        'allowedLocations must be nonempty ranges'
      );
      defect.allowedLocations.forEach(location);
    }
    text(defect.rationale, 'defect rationale');
    text(defect.evidenceUrl, 'defect evidence');
  }
}
export function materializeCorpus(source, outputDir) {
  check(
    source?.schema === `${PREFIX}corpus-source/v1`,
    'invalid source schema'
  );
  check(
    Array.isArray(source.cases) && source.cases.length > 0,
    'nonempty cases required'
  );
  unique(
    source.cases.map(item => item.id),
    'case'
  );
  // Whitelist fields so answer/fix labels cannot accidentally enter reviewer inputs.
  const inputs = source.cases.map(item => ({
    id: item.id,
    source: {
      repository: item.source?.repository,
      originalPr: item.source?.originalPr,
      baseSha: item.source?.baseSha,
      headSha: item.source?.headSha,
    },
    diff: item.diff,
    context: item.context?.map(file => ({
      path: file.path,
      revisionSha: file.revisionSha,
      content: file.content,
    })),
  }));
  inputs.forEach(validateInput);
  source.cases.forEach(item => validateAnswer(item.answer));
  const answers = Object.fromEntries(
    source.cases.map(item => [item.id, item.answer])
  );
  const body = {
    schema: `${PREFIX}corpus/v1`,
    cases: inputs.map(input => ({ id: input.id, inputDigest: digest(input) })),
    answersDigest: digest(answers),
  };
  const manifest = { ...body, corpusDigest: digest(body) };
  mkdirSync(outputDir);
  mkdirSync(join(outputDir, 'inputs'));
  inputs.forEach(input =>
    write(join(outputDir, 'inputs', `${input.id}.json`), input)
  );
  write(join(outputDir, 'answers.json'), answers);
  write(join(outputDir, 'manifest.json'), manifest);
  return manifest;
}
export function loadCorpus(dir) {
  const manifest = read(join(dir, 'manifest.json'));
  check(manifest.schema === `${PREFIX}corpus/v1`, 'invalid corpus schema');
  const { corpusDigest, ...body } = manifest;
  check(digest(body) === corpusDigest, 'manifest digest mismatch');
  check(
    Array.isArray(manifest.cases) && manifest.cases.length > 0,
    'cases required'
  );
  unique(
    manifest.cases.map(item => item.id),
    'case'
  );
  const inputs = Object.fromEntries(
    manifest.cases.map(item => {
      id(item.id);
      const input = read(join(dir, 'inputs', `${item.id}.json`));
      check(
        digest(input) === item.inputDigest,
        `input digest mismatch: ${item.id}`
      );
      check(input.id === item.id, 'input id mismatch');
      validateInput(input);
      return [item.id, input];
    })
  );
  const answers = read(join(dir, 'answers.json'));
  check(digest(answers) === manifest.answersDigest, 'answers digest mismatch');
  check(
    Object.keys(answers).length === manifest.cases.length,
    'answer case count mismatch'
  );
  manifest.cases.forEach(item => validateAnswer(answers[item.id]));
  return { manifest, inputs, answers };
}
function timestamp(value) {
  check(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'canonical timestamp required'
  );
  return Date.parse(value);
}
const ratio = (n, d) => (d > 0 ? n / d : null);
const percentile = (values, p) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
    : null;
export function evaluateRun(corpus, run) {
  const { manifest, answers } = corpus;
  check(run?.schema === `${PREFIX}run/v1`, 'invalid run schema');
  check(run.corpusDigest === manifest.corpusDigest, 'wrong corpus digest');
  const candidate = run.candidate;
  text(candidate?.requested, 'requested identity');
  check(
    ['reviewer', 'route-only', 'no-model'].includes(candidate.kind),
    'invalid candidate kind'
  );
  check(Array.isArray(run.cases), 'run cases required');
  unique(
    run.cases.map(item => item.caseId),
    'result case'
  );
  const planned = new Map(manifest.cases.map(item => [item.id, item]));
  const judgments = run.adjudications ?? [];
  check(Array.isArray(judgments), 'adjudications must be an array');
  unique(
    judgments.map(item => `${item.caseId}/${item.findingId}`),
    'adjudication'
  );
  const usedJudgments = new Set();
  const detected = new Set();
  const latencies = [];
  let completedN = 0,
    unavailableN = 0,
    skippedN = 0,
    cleanCases = 0,
    findingsN = 0;
  let confirmedN = 0,
    duplicateN = 0,
    falsePositiveN = 0,
    harmfulN = 0,
    pendingN = 0;
  let routedPositives = 0,
    totalCost = 0,
    knownCostN = 0;
  const positiveN = manifest.cases.filter(
    item => answers[item.id].defects.length > 0
  ).length;
  const defectsN = manifest.cases.reduce(
    (n, item) => n + answers[item.id].defects.length,
    0
  );
  for (const result of run.cases) {
    const spec = planned.get(result.caseId);
    check(spec, 'unknown result case');
    check(result.inputDigest === spec.inputDigest, 'wrong input digest');
    check(
      ['completed', 'unavailable', 'skipped'].includes(result.status),
      'invalid result status'
    );
    if (result.status !== 'completed') {
      text(result.reason, 'unavailable/skipped reason');
      check(
        result.findings === undefined && result.costUsd === undefined,
        'incomplete result cannot claim findings or cost'
      );
      if (result.status === 'unavailable') unavailableN++;
      else skippedN++;
      continue;
    }
    text(candidate.verified, 'verified identity');
    text(candidate.evidence, 'identity evidence');
    const elapsed = timestamp(result.endedAt) - timestamp(result.startedAt);
    check(elapsed >= 0, 'negative latency');
    latencies.push(elapsed);
    check(
      result.costUsd === null ||
        (Number.isFinite(result.costUsd) && result.costUsd >= 0),
      'cost must be nonnegative or null'
    );
    if (result.costUsd !== null) {
      totalCost += result.costUsd;
      knownCostN++;
    }
    check(Array.isArray(result.findings), 'findings array required');
    unique(
      result.findings.map(finding => finding.id),
      'finding'
    );
    if (candidate.kind !== 'reviewer')
      check(
        result.findings.length === 0,
        'baseline cannot claim model findings'
      );
    completedN++;
    const defects = answers[result.caseId].defects;
    if (candidate.kind === 'route-only') {
      check(
        typeof result.routed === 'boolean',
        'route-only result requires routed'
      );
      if (result.routed && defects.length) routedPositives++;
    }
    // No findings only establishes cleanliness for this explicitly adjudicated scope.
    if (
      !defects.length &&
      !result.findings.length &&
      candidate.kind === 'reviewer'
    )
      cleanCases++;
    for (const finding of result.findings) {
      id(finding.id);
      location(finding);
      text(finding.summary, 'finding summary');
      findingsN++;
      const key = `${result.caseId}/${finding.id}`;
      const judgment = judgments.find(
        item => `${item.caseId}/${item.findingId}` === key
      );
      if (!judgment) {
        pendingN++;
        continue;
      }
      usedJudgments.add(key);
      text(judgment.rationale, 'adjudication rationale');
      text(judgment.evidenceUrl, 'adjudication evidence');
      check(
        [
          'confirmed',
          'duplicate',
          'false-positive',
          'harmful',
          'out-of-scope',
        ].includes(judgment.verdict),
        'invalid adjudication verdict'
      );
      if (['confirmed', 'duplicate'].includes(judgment.verdict)) {
        const defect = defects.find(item => item.id === judgment.defectId);
        check(
          defect &&
            [defect, ...(defect.allowedLocations ?? [])].some(
              allowed =>
                finding.path === allowed.path &&
                finding.startLine <= allowed.endLine &&
                finding.endLine >= allowed.startLine
            ),
          'confirmed finding location must overlap verified defect'
        );
        const defectKey = `${result.caseId}/${defect.id}`;
        if (detected.has(defectKey) || judgment.verdict === 'duplicate')
          duplicateN++;
        else {
          detected.add(defectKey);
          confirmedN++;
        }
      } else if (judgment.verdict === 'false-positive') falsePositiveN++;
      else if (judgment.verdict === 'harmful') harmfulN++;
      else pendingN++;
    }
  }
  check(
    usedJudgments.size === judgments.length,
    'adjudication references missing finding'
  );
  return {
    schema: `${PREFIX}report/v1`,
    corpusDigest: manifest.corpusDigest,
    candidate,
    plannedN: manifest.cases.length,
    completedN,
    unavailableN,
    skippedN,
    missingN: manifest.cases.length - run.cases.length,
    coverage: completedN / manifest.cases.length,
    scope: 'listed-defects-only',
    cleanCases,
    defectsN,
    findingsN,
    confirmedN,
    duplicateN,
    falsePositiveN,
    harmfulN,
    pendingN,
    confirmedRecall:
      candidate.kind === 'route-only' ? null : ratio(confirmedN, defectsN),
    confirmedPrecision:
      candidate.kind === 'route-only' ? null : ratio(confirmedN, findingsN),
    routingRecall:
      candidate.kind === 'route-only'
        ? ratio(routedPositives, positiveN)
        : null,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      n: latencies.length,
    },
    costUsd: knownCostN === manifest.cases.length ? totalCost : null,
    knownCostUsd: totalCost,
    knownCostN,
    decision:
      'No production adoption from this bounded replay alone; compare confirmed quality, coverage, availability and measured cost.',
  };
}
export function baselineRun(
  corpus,
  kind,
  now = () => new Date().toISOString()
) {
  check(['route-only', 'no-model'].includes(kind), 'invalid baseline kind');
  const classifierPath = fileURLToPath(
    new URL('../hooks/warden-triage.mjs', import.meta.url)
  );
  const implementationDigest = digest(
    kind === 'route-only'
      ? [
          classifierPath,
          fileURLToPath(new URL('./review-route.mjs', import.meta.url)),
        ].map(file => readFileSync(file, 'utf8'))
      : readFileSync(fileURLToPath(import.meta.url), 'utf8')
  );
  const cases = corpus.manifest.cases.map(spec => {
    const startedAt = now();
    const input = corpus.inputs[spec.id];
    check(digest(input) === spec.inputDigest, 'baseline input digest mismatch');
    let route;
    if (kind === 'route-only') route = routeDiff(input.diff);
    return {
      caseId: spec.id,
      inputDigest: spec.inputDigest,
      status: 'completed',
      startedAt,
      endedAt: now(),
      costUsd: null,
      findings: [],
      ...(route ? { routed: route.review, routeReason: route.reason } : {}),
    };
  });
  return {
    schema: `${PREFIX}run/v1`,
    corpusDigest: corpus.manifest.corpusDigest,
    candidate: {
      requested: kind,
      verified: `${kind}@sha256:${implementationDigest}`,
      evidence:
        kind === 'route-only'
          ? 'local classifier and patch-parser content digest; no supplier invoked'
          : 'local review-benchmark.mjs content digest; zero model calls',
      kind,
    },
    cases,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, input, output, reportPath] = process.argv.slice(2);
  try {
    let result;
    if (command === 'materialize' && input && output)
      result = materializeCorpus(read(input), output);
    else if (command === 'baseline' && input && output)
      result = baselineRun(loadCorpus(input), output);
    else if (command === 'evaluate' && input && output)
      result = evaluateRun(loadCorpus(input), read(output));
    else
      throw new Error(
        'Usage: review-benchmark.mjs materialize SOURCE.json NEW_DIR | evaluate CORPUS_DIR RUN.json [REPORT.json] | baseline CORPUS_DIR route-only|no-model [RUN.json]'
      );
    if (reportPath) write(reportPath, result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
