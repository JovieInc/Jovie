import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import {
  LANES_COVERAGE_COMMAND,
  LANES_PYTEST_FILES,
} from '../../ci-fast-lanes.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

it('includes extracted public-feed regressions in the installed release', () => {
  const tests = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        [
          'import ast,json,pathlib',
          'tree=ast.parse(pathlib.Path("scripts/lanes/lane_runner.py").read_text())',
          'value=next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="LANE_TESTS" for t in n.targets))',
          'print(json.dumps(ast.literal_eval(value)))',
        ].join('; '),
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
  );
  expect(tests).toContain('scripts/tests/test_public_feed.py');
});

it('runs extracted public-feed regressions in coverage qualification', () => {
  expect(LANES_PYTEST_FILES).toContain('scripts/tests/test_public_feed.py');
});

it('retains the existing coverage floor on extracted public-feed logic', () => {
  const report = LANES_COVERAGE_COMMAND.split(' && ').find(
    command =>
      command.includes('coverage report') &&
      command.includes('*/scripts/lanes/public_feed.py')
  );
  expect(report).toContain('*/scripts/lanes/doctor.py');
  expect(report).toContain('--fail-under=85');
});
