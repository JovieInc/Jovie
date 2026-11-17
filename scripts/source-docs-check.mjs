#!/usr/bin/env node
/** Native source applicability. Loaded from the exact trusted PR base. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidate } from './anti-slop/run.mjs';
import {
  loadDocFreshnessRegistry,
  runDocFreshnessLint,
} from './lib/doc-freshness.mjs';
import { classifySourceDocs } from './lib/source-docs-scope.mjs';
import {
  assertInertSourceProse,
  readSourceProseEntries,
} from './lib/source-prose.mjs';

const SHA = /^[a-f0-9]{40}$/;
const here = fileURLToPath(new URL('.', import.meta.url));
const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });

export function planSourceDocs({
  root = process.cwd(),
  baseSha,
  headSha,
  currentBaseSha = baseSha,
  classify = classifySourceDocs,
}) {
  const full = reason => ({
    eligible: false,
    reasons: [reason],
    paths: [],
    baseSha,
    headSha,
  });
  if (!SHA.test(baseSha) || !SHA.test(headSha))
    return full('invalid-exact-range');
  if (git(root, ['rev-parse', 'HEAD']).trim() !== headSha)
    throw new Error('Source head mismatch');
  if (git(root, ['diff', '--name-only', 'HEAD']).trim())
    throw new Error('Source checkout is modified');
  if (currentBaseSha !== baseSha) return full('base-advanced');
  if (git(root, ['merge-base', baseSha, headSha]).trim() !== baseSha)
    return full('base-not-ancestor');
  // Disabling rename detection retains BOTH deleted originals and destinations.
  const listed = git(root, [
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    baseSha,
    headSha,
  ]);
  if (listed && !listed.endsWith('\0')) return full('incomplete-diff');
  const paths = listed ? listed.slice(0, -1).split('\0') : [];
  if (
    paths.length >= 300 ||
    paths.some(path => path.length > 1024) ||
    Number(git(root, ['rev-list', '--count', `${baseSha}..${headSha}`])) > 250
  ) {
    return {
      ...full('source-range-exceeds-receipt-bound'),
      paths: [...paths].sort(),
    };
  }
  if (
    git(root, [
      'diff',
      '--diff-filter=D',
      '--no-renames',
      '--name-only',
      '-z',
      baseSha,
      headSha,
    ])
  ) {
    return { ...full('deleted-or-renamed-input'), paths: [...paths].sort() };
  }
  try {
    assertInertSourceProse(
      paths,
      readSourceProseEntries({ root, headSha, paths })
    );
  } catch (error) {
    return {
      ...full(`non-inert-source-prose:${error.message}`),
      paths: [...paths].sort(),
    };
  }
  const classification = classify(paths, { root });
  return { ...classification, baseSha, headSha };
}

export function checkSourceDocs(
  plan,
  { root = process.cwd(), execute = execFileSync } = {}
) {
  const current = planSourceDocs({
    root,
    baseSha: plan.baseSha,
    headSha: plan.headSha,
  });
  if (
    !current.eligible ||
    JSON.stringify(current.paths) !== JSON.stringify(plan.paths)
  ) {
    throw new Error('Source docs applicability changed');
  }
  // These are the docs consumers from the existing merged structural guard.
  // Dependency-backed disk-read tests and other source guards select the full path.
  const freshness = runDocFreshnessLint(
    loadDocFreshnessRegistry(undefined, root),
    { repoRoot: root }
  );
  console.log(
    `doc-review-qualification: ${JSON.stringify(freshness.qualification)}`
  );
  if (freshness.violations.length)
    throw new Error(
      `Documentation drift: ${JSON.stringify(freshness.violations)}`
    );
  const antiSlop = runValidate(root);
  if (antiSlop.errors.length) throw new Error(antiSlop.errors.join('\n'));
  // Eligibility proves executable files are unchanged from the trusted base.
  execute(
    process.execPath,
    ['--test', '--test-isolation=none', 'scripts/anti-slop/anti-slop.test.mjs'],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 60000,
    }
  );
  execute(
    process.execPath,
    [resolve(here, 'invariants/gate-weakening-detector.mjs'), '--check'],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 60000,
      env: { ...process.env, GATE_WEAKENING_BASE: plan.baseSha },
    }
  );
  return {
    eligible: true,
    baseSha: plan.baseSha,
    headSha: plan.headSha,
    paths: plan.paths,
  };
}

export function main(args = process.argv.slice(2), env = process.env) {
  const path = env.SOURCE_DOCS_PLAN;
  if (!path) throw new Error('Missing source docs plan path');
  if (args[0] === 'plan') {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const pr = event.pull_request;
    const boundSource =
      env.GITHUB_EVENT_NAME === 'pull_request' &&
      env.GITHUB_REPOSITORY === 'JovieInc/Jovie' &&
      event.repository?.full_name === env.GITHUB_REPOSITORY &&
      Number.isSafeInteger(pr?.number) &&
      pr.number > 0 &&
      pr.number === event.number &&
      pr?.head?.repo?.full_name === env.GITHUB_REPOSITORY &&
      pr.head.repo.fork === false &&
      pr.base?.repo?.full_name === env.GITHUB_REPOSITORY &&
      pr.base.ref === 'main' &&
      pr.base.sha === env.EXPECTED_BASE &&
      pr.head.sha === env.EXPECTED_HEAD;
    const plan = boundSource
      ? planSourceDocs({
          baseSha: env.EXPECTED_BASE,
          headSha: env.EXPECTED_HEAD,
          currentBaseSha: env.CURRENT_BASE,
        })
      : { eligible: false, reasons: ['unsupported-source-event'], paths: [] };
    writeFileSync(path, `${JSON.stringify(plan)}\n`, { flag: 'wx' });
    if (env.GITHUB_OUTPUT)
      appendFileSync(
        env.GITHUB_OUTPUT,
        `docs_only=${plan.eligible === true}\nplan=${path}\n`
      );
    console.log(JSON.stringify(plan));
    return plan;
  }
  if (args[0] !== 'check') throw new Error('Expected plan or check');
  return checkSourceDocs(JSON.parse(readFileSync(path, 'utf8')));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
