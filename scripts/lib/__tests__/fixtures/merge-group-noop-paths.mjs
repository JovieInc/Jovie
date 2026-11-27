import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { spawnSync } from '../../child-process.mjs';

// A no-op claim from the base-owned resolver still requires independent tree proof.
const resolver = `
import { writeFileSync } from 'node:fs';
const value = flag => process.argv[process.argv.indexOf(flag) + 1];
writeFileSync(value('--files-out'), '');
writeFileSync(value('--meta-out'), 'IS_NOOP=true\\nSOURCE=noop\\n');
`;

const disabledOutputs = [
  'run_build',
  'run_test',
  'run_test_performance',
  'run_storybook_a11y',
  'run_public_lighthouse',
  'run_dashboard_lighthouse',
  'run_onboarding_lighthouse',
  'run_admin_lighthouse',
  'run_chat_lighthouse',
  'run_promptfoo_evals',
  'run_golden_eval_set',
  'run_e2e',
  'run_golden_path',
  'run_drizzle',
  'run_neon',
  'run_ios',
  'run_macos',
  'run_web',
  'run_operations',
  'run_cross_product',
  'has_code_changes',
  'run_jovie_product',
  'run_jovie_typecheck',
  'run_symphony_control',
  'run_summer_ops',
  'run_actionlint',
];

export function assertNoopPathOutputs(repoRoot, detect, scenario, status) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'noop-path-outputs-')));
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  const git = (...args) => {
    const result = spawnSync(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'commit.gpgSign=false',
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        ...args,
      ],
      { cwd: root, env: cleanEnv, encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };

  try {
    git('init', '-q');
    const lib = join(root, 'scripts/lib');
    mkdirSync(lib, { recursive: true });
    writeFileSync(join(lib, 'resolve-merge-group-path-diff.mjs'), resolver);
    copyFileSync(
      join(repoRoot, 'scripts/lib/ci-repo-lanes.mjs'),
      join(lib, 'ci-repo-lanes.mjs')
    );
    git('add', 'scripts');
    git('commit', '-qm', 'Base classifier and no-op claim');
    const base = git('rev-parse', 'HEAD');
    if (scenario === 'different trees') {
      writeFileSync(join(root, 'changed'), 'new content');
      git('add', 'changed');
    }
    git('commit', '--allow-empty', '-qm', 'Merge candidate');
    const head =
      scenario === 'unreadable trees'
        ? 'e'.repeat(40)
        : git('rev-parse', 'HEAD');
    const output = join(root, 'step-output');
    const previous = 'previous_output=preserved';
    writeFileSync(output, previous + '\n');
    const result = spawnSync('bash', ['-c', detect], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...cleanEnv,
        EVENT_NAME: 'merge_group',
        IS_FORK_PULL_REQUEST: 'false',
        EVENT_MERGE_GROUP_BASE_SHA: base,
        EVENT_MERGE_GROUP_HEAD_SHA: head,
        RUNNER_TEMP: root,
        GITHUB_OUTPUT: output,
      },
    });
    expect(result.status, result.stderr || result.stdout).toBe(status);
    const lines = readFileSync(output, 'utf8').trimEnd().split('\n').sort();
    const expected = [previous];
    if (status === 0) {
      expected.push(
        `path_diff_base_sha=${base}`,
        `path_diff_head_sha=${head}`,
        'is_noop_merge_group=true',
        'selected_lanes=none',
        'shared_contract_impact=none',
        ...disabledOutputs.map(name => `${name}=false`)
      );
    }
    expect(lines).toEqual(expected.sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
