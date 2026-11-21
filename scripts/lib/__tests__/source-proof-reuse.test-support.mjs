import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { load } = createRequire(import.meta.url)('js-yaml');

export function sourceValidationWorkflow() {
  return load(readFileSync('.github/workflows/source-validation.yml', 'utf8'));
}

/**
 * @param {object} options
 * @param {object[]} options.runs
 * @param {boolean} [options.ghFails]
 * @param {string} [options.sha]
 * @param {string} [options.quota]
 * @param {string} [options.guardJobConclusion]
 * @param {boolean} [options.jobsFail]
 */
export function runProofReuse({
  runs,
  ghFails = false,
  sha = 'a'.repeat(40),
  quota = '5000',
  guardJobConclusion = 'success',
  jobsFail = false,
}) {
  const step = sourceValidationWorkflow().jobs.deterministic.steps.find(
    candidate => candidate.id === 'reuse'
  );
  const root = mkdtempSync(join(tmpdir(), 'source-proof-reuse-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    cpSync(
      'packages/api-client',
      join(root, '.source-validation-client/packages/api-client'),
      { recursive: true }
    );
    writeFileSync(join(root, 'quota'), quota);
    for (const [name, script] of Object.entries({
      sleep: `printf '%s\\n' "$*" >> "${root}/sleep.log"`,
    }))
      writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    writeFileSync(
      join(root, 'runs.json'),
      JSON.stringify({ workflow_runs: runs })
    );
    writeFileSync(
      join(root, 'jobs.json'),
      JSON.stringify({
        jobs: [
          {
            name: 'Affected Unit Tests (4/4)',
            conclusion: guardJobConclusion,
          },
        ],
      })
    );
    writeFileSync(
      join(bin, 'gh'),
      `#!/bin/sh
printf '%s\\n' "$*" >> "${root}/gh.log"
${
  ghFails
    ? 'exit 1'
    : `case "$*" in
  *rate_limit*) cat "${root}/quota" ;;
  */jobs*)
    ${
      jobsFail
        ? 'exit 1'
        : `# Mirror the workflow --jq filter; the real gh applies it server-side.
    jq -r '[.jobs[] | select(.name == "Affected Unit Tests (4/4)")] | first | .conclusion // empty' "${root}/jobs.json"`
    }
    ;;
  *) cat "${root}/runs.json" ;;
esac`
}
`,
      { mode: 0o755 }
    );
    const output = join(root, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', step.run], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: join(root, 'summary'),
        JOVIE_API_STATE_DIR: join(root, 'state'),
        GH_TOKEN: 'test',
        HEAD_SHA: sha,
        HEAD_REF: 'agent/jov-1',
        REPOSITORY: 'JovieInc/Jovie',
        RUN_ID: '500',
      },
    });
    let ghLog = '';
    try {
      ghLog = readFileSync(join(root, 'gh.log'), 'utf8');
    } catch {}
    return {
      status: result.status,
      stderr: result.stderr,
      output: readFileSync(output, 'utf8'),
      ghLog,
      budgeted: existsSync(join(root, 'state/api-ledger/github.json')),
      sleeps: existsSync(join(root, 'sleep.log'))
        ? readFileSync(join(root, 'sleep.log'), 'utf8')
        : '',
      summary: existsSync(join(root, 'summary'))
        ? readFileSync(join(root, 'summary'), 'utf8')
        : '',
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export const proofRun = (id, conclusion, overrides = {}) => ({
  id,
  conclusion,
  head_sha: 'a'.repeat(40),
  head_branch: 'agent/jov-1',
  path: '.github/workflows/source-validation.yml',
  ...overrides,
});
