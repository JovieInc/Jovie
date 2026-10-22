import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runA11yRunnerControls,
  verifyA11yRunnerControls,
} from '../../../scripts/verify-storybook-a11y-runner.mjs';

function observedPattern() {
  const healthy = (name: string) => ({
    name,
    state: 'passed',
    a11y: [
      {
        status: 'passed',
        violations: [] as string[],
        incomplete: [] as string[],
        error: null,
      },
    ],
  });
  return {
    exitCode: 1,
    findings: {
      unhandledErrors: [] as string[],
      reason: 'failed',
      records: [
        healthy('Default Healthy'),
        {
          name: 'Default Violation',
          state: 'passed',
          a11y: [
            {
              status: 'warning',
              violations: ['button-name'],
              incomplete: [] as string[],
              error: null,
            },
          ],
        },
        healthy('Error Healthy'),
        { name: 'Error Violation', state: 'failed', a11y: [] },
      ],
    },
    cli: {
      numTotalTests: 4,
      numPassedTests: 3,
      numFailedTests: 1,
      testResults: [
        {
          message: '',
          assertionResults: [
            {
              fullName: 'A11y runner controls Error Violation',
              status: 'failed',
              failureMessages: [
                'Error: expect(received).toHaveNoViolations(expected)\nButtons must have discernible text (button-name)',
              ],
            },
          ],
        },
      ],
    },
  };
}

type Observation = ReturnType<typeof observedPattern>;
const corruptions: [string, (value: Observation) => void][] = [
  [
    'unhandled runner error beside expected test counts',
    value => {
      value.findings.unhandledErrors.push('Unhandled browser exception');
    },
  ],
  [
    'module error beside expected test counts',
    value => {
      value.cli.testResults[0].message = 'afterAll cleanup failed';
    },
  ],
  [
    'interrupted run beside expected test counts',
    value => {
      value.findings.reason = 'interrupted';
    },
  ],
  [
    'all-green runner with absent detection',
    value => {
      value.exitCode = 0;
    },
  ],
  [
    'zero executed controls',
    value => {
      value.findings.records = [];
    },
  ],
  [
    'healthy control with no addon report',
    value => {
      value.findings.records[0].a11y = [];
    },
  ],
  [
    'warning control with no addon report',
    value => {
      value.findings.records[1].a11y = [];
    },
  ],
  [
    'falsely failing healthy control',
    value => {
      value.findings.records[0].state = 'failed';
    },
  ],
  [
    'changed default error policy',
    value => {
      value.findings.records[1].state = 'failed';
    },
  ],
  [
    'unrelated render failure',
    value => {
      value.cli.testResults[0].assertionResults[0].failureMessages = [
        'Failed to fetch dynamically imported module',
      ];
    },
  ],
  [
    'render error merely mentioning the rule name',
    value => {
      value.cli.testResults[0].assertionResults[0].failureMessages = [
        'ReferenceError: button-name fixture failed while rendering',
      ];
    },
  ],
  [
    'wrong failed control',
    value => {
      value.cli.testResults[0].assertionResults[0].fullName = 'Default Healthy';
    },
  ],
  [
    'duplicate control replacing a missing one',
    value => {
      value.findings.records[2].name = 'Default Healthy';
    },
  ],
  [
    'additional failed tests',
    value => {
      value.cli.numFailedTests = 2;
    },
  ],
  [
    'unrelated extra axe violation',
    value => {
      value.findings.records[1].a11y[0].violations.push('color-contrast');
    },
  ],
];

describe('Storybook a11y runner diagnostic', () => {
  it('invokes the canonical bounded runner and verifies newly written reports', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'a11y-runner-command-'));
    try {
      writeFileSync(resolve(directory, 'findings.json'), 'stale');
      writeFileSync(resolve(directory, 'cli.json'), 'stale');
      // Wrapper integration double only; separate real Chromium receipt is required.
      const result = runA11yRunnerControls(
        directory,
        (command, args, options) => {
          expect(command).toBe('pnpm');
          expect(args).toContain('--config=vitest.config.storybook.mts');
          expect(args).toContain('--maxWorkers=1');
          expect(args).toContain('--retry=0');
          expect(resolve(String(options.cwd))).toBe(
            resolve(import.meta.dirname, '../../..')
          );
          expect(options.env?.JOVIE_STORYBOOK_A11Y_CONTROLS).toBe('1');
          expect(options.env?.JOVIE_LIVE_STORYBOOK_CERT).toBe('0');
          expect(options.env?.JOVIE_STORYBOOK_MANUAL_AXE).toBe('0');
          expect(existsSync(resolve(directory, 'findings.json'))).toBe(false);
          expect(existsSync(resolve(directory, 'cli.json'))).toBe(false);
          const observed = observedPattern();
          writeFileSync(
            resolve(directory, 'findings.json'),
            JSON.stringify(observed.findings)
          );
          writeFileSync(
            resolve(directory, 'cli.json'),
            JSON.stringify(observed.cli)
          );
          return {
            status: 1,
            signal: null,
            stdout: 'expected negative control',
            stderr: '',
          };
        }
      );
      expect(result.expectedPatternObserved).toBe(true);
      expect(result.output).toBe(directory);
      expect(readFileSync(resolve(directory, 'runner.log'), 'utf8')).toBe(
        'expected negative control'
      );
      expect(
        JSON.parse(readFileSync(resolve(directory, 'run.json'), 'utf8'))
          .exitCode
      ).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a launch failure before consuming reports', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'a11y-runner-launch-'));
    try {
      expect(() =>
        runA11yRunnerControls(directory, () => ({
          status: null,
          signal: null,
          error: new Error('launch failed'),
          stdout: '',
          stderr: '',
        }))
      ).toThrow('runner must complete without a launch/timeout error');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['checkout', 'checkout with spaces #é'])(
    'rejects stale receipts when a new runner in %s fails before writing any results',
    checkoutName => {
      const directory = mkdtempSync(resolve(tmpdir(), 'a11y-stale-receipts-'));
      try {
        const checkout = resolve(directory, checkoutName);
        symlinkSync(
          resolve(import.meta.dirname, '../../../../..'),
          checkout,
          'dir'
        );
        const old = observedPattern();
        writeFileSync(resolve(directory, 'cli.json'), JSON.stringify(old.cli));
        writeFileSync(
          resolve(directory, 'findings.json'),
          JSON.stringify(old.findings)
        );
        // Failure-path unit double only; actual Chromium controls run separately.
        writeFileSync(resolve(directory, 'pnpm'), '#!/bin/sh\nexit 1\n', {
          mode: 0o755,
        });
        const result = spawnSync(
          process.execPath,
          [
            resolve(
              checkout,
              'apps/web/scripts/verify-storybook-a11y-runner.mjs'
            ),
            directory,
          ],
          {
            encoding: 'utf8',
            env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
          }
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('ENOENT');
        expect(existsSync(resolve(directory, 'cli.json'))).toBe(false);
        expect(existsSync(resolve(directory, 'findings.json'))).toBe(false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it('accepts real-addon healthy/warning/error pattern, including thrown-error metadata loss', () => {
    expect(verifyA11yRunnerControls(observedPattern())).toEqual({
      controls: 4,
      rawPassed: 3,
      rawFailed: 1,
      expectedPatternObserved: true,
    });
  });

  it.each(corruptions)('rejects %s', (_name, corrupt) => {
    const value = observedPattern();
    corrupt(value);
    expect(() => verifyA11yRunnerControls(value)).toThrow();
  });
});
