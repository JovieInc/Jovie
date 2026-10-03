import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../.github/workflows/staging-controller.yml'
  ),
  'utf8'
);
const script = workflow
  .split('        run: |\n')[2]
  .split('\n      - ')[0]
  .split('\n')
  .map(line => line.replace(/^ {10}/, ''))
  .join('\n');
const fetchReceiptScript = workflow
  .split('        run: |\n')[1]
  .split('\n      - ')[0]
  .split('\n')
  .map(line => line.replace(/^ {10}/, ''))
  .join('\n');
const sourceSha = 'a'.repeat(40);
const mainSha = 'b'.repeat(40);
const candidateSha = 'c'.repeat(40);
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function authorize(
  candidateRelation,
  {
    candidateMainRelation = 'ahead',
    web = true,
    missingReceipt = false,
    main = mainSha,
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'staging-supersession-'));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(root, 'product-lane-release'));
  if (!missingReceipt)
    writeFileSync(
      join(root, 'product-lane-release/release.json'),
      JSON.stringify({
        provenance: { sha: sourceSha },
        releaseRouting: { sourceMainRunId: '100' },
        aggregatePassed: true,
        selectedLanes: web ? ['web'] : ['operations'],
      })
    );
  const gh = join(bin, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const endpoint = args[1];
if (args[0] === 'api') {
  if (endpoint.endsWith('/commits/main')) console.log(process.env.MAIN_SHA);
  else if (endpoint.includes('/compare/')) {
    const range = endpoint.split('/compare/')[1];
    if (range === process.env.SOURCE_SHA + '...' + process.env.CANDIDATE_SHA)
      console.log(process.env.CANDIDATE_RELATION);
    else if (range === process.env.CANDIDATE_SHA + '...' + process.env.MAIN_SHA)
      console.log(process.env.CANDIDATE_MAIN_RELATION);
    else if (range === process.env.SOURCE_SHA + '...' + process.env.MAIN_SHA)
      console.log('ahead');
    else process.exit(2);
  } else if (endpoint.includes('/actions/workflows/ci.yml/runs?'))
    console.log(JSON.stringify({ workflow_runs: [{ id: 101, run_attempt: 1,
      head_sha: process.env.CANDIDATE_SHA, head_branch: 'main',
      path: '.github/workflows/ci.yml', conclusion: 'success' }] }));
  else process.exit(2);
} else if (args[0] === 'run' && args[1] === 'download') {
  const dir = args[args.indexOf('--dir') + 1];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({
    provenance: { sha: process.env.CANDIDATE_SHA },
    releaseRouting: { sourceMainRunId: '101' }, aggregatePassed: true,
    selectedLanes: ['web'] }));
} else process.exit(2);
`
  );
  chmodSync(gh, 0o755);
  const output = join(root, 'github-output');
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      RUNNER_TEMP: root,
      GITHUB_OUTPUT: output,
      EXPECTED_SHA: sourceSha,
      SOURCE_CI_RUN_ID: '100',
      SOURCE_CI_RUN_ATTEMPT: '1',
      SOURCE_CI_WORKFLOW_PATH: '.github/workflows/ci.yml',
      SOURCE_CI_HEAD_BRANCH: 'main',
      SOURCE_CI_HEAD_REPOSITORY: 'JovieInc/Jovie',
      REPOSITORY: 'JovieInc/Jovie',
      SOURCE_SHA: sourceSha,
      MAIN_SHA: main,
      CANDIDATE_SHA: candidateSha,
      CANDIDATE_RELATION: candidateRelation,
      CANDIDATE_MAIN_RELATION: candidateMainRelation,
    },
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  return JSON.parse(readFileSync(join(root, 'staging-lineage.json'), 'utf8'));
}

describe('Staging Controller supersession', () => {
  it('queries successful runs when searching for a superseding generation', () => {
    expect(workflow).toContain(
      'branch=main&event=push&status=success&per_page=100'
    );
    expect(workflow).not.toContain(
      'branch=main&event=push&status=completed&per_page=100'
    );
  });

  it.each(['behind', 'identical', 'diverged', ''])(
    'keeps the source generation when a later CI run is %s to its SHA',
    relation => {
      expect(authorize(relation)).toMatchObject({
        sha: sourceSha,
        outcome: 'proceed',
        replacementSha: sourceSha,
      });
    }
  );

  it('supersedes only with a validated descendant on current main', () => {
    expect(authorize('ahead')).toMatchObject({
      outcome: 'superseded',
      replacementSha: candidateSha,
    });
  });

  it('does not supersede with a descendant outside current main lineage', () => {
    expect(
      authorize('ahead', { candidateMainRelation: 'diverged' })
    ).toMatchObject({
      outcome: 'proceed',
      replacementSha: sourceSha,
    });
  });

  it('records non-web changes without staging mutation', () => {
    expect(authorize('ahead', { web: false })).toMatchObject({
      outcome: 'not_applicable',
      replacementSha: sourceSha,
    });
  });

  it('supersedes an unreceipted generation once current main is a descendant', () => {
    expect(authorize('ahead', { missingReceipt: true })).toMatchObject({
      outcome: 'superseded',
      replacementSha: mainSha,
    });
  });

  it('fails closed when current main itself sealed no release receipt', () => {
    const root = mkdtempSync(join(tmpdir(), 'staging-supersession-'));
    roots.push(root);
    const bin = join(root, 'bin');
    mkdirSync(bin);
    mkdirSync(join(root, 'product-lane-release'));
    const gh = join(bin, 'gh');
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'api' && args[1].endsWith('/commits/main'))
  console.log(process.env.MAIN_SHA);
else process.exit(2);
`
    );
    chmodSync(gh, 0o755);
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        RUNNER_TEMP: root,
        GITHUB_OUTPUT: join(root, 'github-output'),
        EXPECTED_SHA: sourceSha,
        SOURCE_CI_RUN_ID: '100',
        SOURCE_CI_RUN_ATTEMPT: '1',
        SOURCE_CI_WORKFLOW_PATH: '.github/workflows/ci.yml',
        SOURCE_CI_HEAD_BRANCH: 'main',
        SOURCE_CI_HEAD_REPOSITORY: 'JovieInc/Jovie',
        REPOSITORY: 'JovieInc/Jovie',
        MAIN_SHA: sourceSha,
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(
      'Current main CI attempt sealed no product-lane release receipt'
    );
  });
});

describe('Staging Controller sealed receipt fetch', () => {
  function fetchReceipt(artifacts) {
    const root = mkdtempSync(join(tmpdir(), 'staging-receipt-fetch-'));
    roots.push(root);
    const bin = join(root, 'bin');
    mkdirSync(bin);
    // Mirrors real `gh api` parsing: exactly `api <endpoint> --jq <expr>`;
    // jq-style flags like `--arg` are rejected with "accepts 1 arg(s)".
    const gh = join(bin, 'gh');
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== 'api' ||
    !(args.length === 2 ||
      (args.length === 4 && args[2] === '--jq'))) {
  console.error('accepts 1 arg(s), received ' + (args.length - 1));
  process.exit(1);
}
const endpoint = args[1];
if (endpoint.includes('/actions/artifacts?')) {
  const name = new URLSearchParams(endpoint.split('?')[1]).get('name');
  if (name !== process.env.RECEIPT_NAME) process.exit(2);
  const artifacts = JSON.parse(process.env.ARTIFACTS_JSON).artifacts;
  // Equivalent of: [.artifacts[] | select(.expired == false)]
  //   | sort_by(.id) | last | .id // empty
  const active = artifacts.filter(a => a.expired === false)
    .sort((a, b) => a.id - b.id);
  console.log(active.length ? String(active[active.length - 1].id) : '');
} else if (endpoint ===
  'repos/JovieInc/Jovie/actions/artifacts/8/zip') {
  process.stdout.write('zip-bytes');
} else process.exit(2);
`
    );
    chmodSync(gh, 0o755);
    const unzip = join(bin, 'unzip');
    writeFileSync(
      unzip,
      `#!/usr/bin/env bash
dir="\${@: -1}"
printf '%s' '{}' > "$dir/release.json"
`
    );
    chmodSync(unzip, 0o755);
    const receiptName = `product-lane-release-${sourceSha}-1`;
    const result = spawnSync('bash', ['-c', fetchReceiptScript], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        RUNNER_TEMP: root,
        REPOSITORY: 'JovieInc/Jovie',
        EXPECTED_SHA: sourceSha,
        SOURCE_CI_RUN_ID: '100',
        SOURCE_CI_RUN_ATTEMPT: '1',
        RECEIPT_NAME: receiptName,
        ARTIFACTS_JSON: JSON.stringify({ artifacts }),
      },
    });
    return {
      result,
      receiptPath: join(root, 'product-lane-release', 'release.json'),
    };
  }

  it('fetches the newest unexpired sealed receipt via a name-filtered api call', () => {
    const receiptName = `product-lane-release-${sourceSha}-1`;
    const { result, receiptPath } = fetchReceipt([
      { id: 5, name: receiptName, expired: false },
      { id: 9, name: receiptName, expired: true },
      { id: 8, name: receiptName, expired: false },
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toEqual({});
  });

  it('proceeds without a receipt when the attempt sealed none', () => {
    const { result, receiptPath } = fetchReceipt([]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(existsSync(receiptPath)).toBe(false);
  });
});
