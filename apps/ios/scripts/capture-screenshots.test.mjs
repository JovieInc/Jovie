import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const captureScript = path.join(scriptDir, 'capture-screenshots.sh');
const captureSource = readFileSync(captureScript, 'utf8');
const iosWorkflowSource = readFileSync(
  path.join(repoRoot, '.github/workflows/ios-ci.yml'),
  'utf8'
);

const xcrunStub = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$LOG"
if [[ "$1 $2" == "simctl bootstatus" ]]; then
  if [[ "$MODE" == "boot-fail" ]]; then
    echo "bootstatus not finished" >&2
    exit 1
  fi
  exit 0
fi
if [[ "$1 $2" == "simctl launch" ]]; then
  if [[ "$MODE" == "hang" ]]; then
    sleep 5
    exit 0
  fi
  launches=$(grep -c 'simctl launch' "$LOG" || true)
  if [[ "$MODE" == "retry-then-success" && "$launches" -ge 2 ]]; then
    exit 0
  fi
  exit 9
fi
exit 0
`;

test('screenshot launch is a longer bounded retry that still fails closed', () => {
  assert.match(captureSource, /xcrun simctl bootstatus "\$udid" -b/);
  assert.match(captureSource, /IOS_SCREENSHOT_LAUNCH_TIMEOUT:-45/);
  assert.match(captureSource, /IOS_SCREENSHOT_LAUNCH_ATTEMPTS:-3/);
  assert.match(captureSource, /IOS_SCREENSHOT_LAUNCH_TIMEOUT_CAP=60/);
  assert.match(captureSource, /IOS_SCREENSHOT_LAUNCH_ATTEMPTS_CAP=3/);
  assert.match(captureSource, /IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT_CAP=45/);
  assert.match(captureSource, /IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT_CAP=30/);
  assert.match(captureSource, /IOS_SCREENSHOT_LAUNCH_TERMINATE_TIMEOUT_CAP=20/);
  assert.doesNotMatch(
    captureSource.slice(
      captureSource.indexOf('ensure_booted_for_launch()'),
      captureSource.indexOf('launch_for_capture()')
    ),
    /IOS_SCREENSHOT_BOOT_COMMAND_TIMEOUT/
  );
  assert.match(
    captureSource,
    /Unable to launch \$\{BUNDLE_ID\} on \$\{udid\} for \$\{name\} after \$\{attempts\} attempts\./
  );
  assert.match(
    captureSource,
    /if ! launch_for_capture "\$udid" "\$name" "\$@"; then\n    return 1\n  fi/
  );
  assert.doesNotMatch(captureSource, /IOS_SCREENSHOT_LAUNCH_TIMEOUT:-20/);

  const screenshotStep = iosWorkflowSource.match(
    /- name: Capture simulator screenshots[\s\S]*?- name: Upload simulator screenshots/
  );
  assert.ok(screenshotStep, 'screenshot step must stay in the full regression job');
  assert.match(screenshotStep[0], /timeout-minutes: 15/);
  assert.doesNotMatch(screenshotStep[0], /continue-on-error/);
  assert.match(
    iosWorkflowSource,
    /timeout-minutes: \$\{\{ inputs\.full-regression && 55 \|\| 18 \}\}/
  );
  const fullStepTimeout = iosWorkflowSource.match(
    /- name: Run full simulator regression[\s\S]*?timeout-minutes: ([0-9]+)/
  );
  assert.equal(fullStepTimeout?.[1], '30');
  assert.match(
    iosWorkflowSource,
    /JOVIE_IOS_XCODEBUILD_TIMEOUT_SECONDS: "1680"/
  );
  assert.match(iosWorkflowSource, /path: artifacts\/ios-screenshots\/\*\.png/);
});

function runLaunch(mode, env = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-screenshot-launch-'));
  const bin = path.join(root, 'bin');
  const out = path.join(root, 'out');
  const log = path.join(root, 'xcrun.log');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'xcrun'), xcrunStub, { mode: 0o755 });
  try {
    const result = spawnSync(
      'bash',
      [
        '-c',
        [
          'set -euo pipefail',
          'source "$CAPTURE_SCRIPT"',
          'mkdir -p "$OUTPUT_DIR"',
          'set +e',
          'launch_for_capture "$UDID" "$NAME" -ui-testing-splash',
          'status=$?',
          'set -e',
          'printf "__STATUS__%s\\n" "$status"',
        ].join('\n'),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAPTURE_SCRIPT: captureScript,
          IOS_SCREENSHOT_DIR: out,
          UDID: 'SIM-1',
          NAME: '00-loading',
          MODE: mode,
          LOG: log,
          PATH: `${bin}:${process.env.PATH}`,
          IOS_SCREENSHOT_LAUNCH_TIMEOUT: '1',
          IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT: '1',
          IOS_SCREENSHOT_LAUNCH_ATTEMPTS: '3',
          IOS_SCREENSHOT_LAUNCH_RETRY_DELAY: '0',
          IOS_SCREENSHOT_TERMINATE_TIMEOUT: '1',
          IOS_SCREENSHOT_BOOT_COMMAND_TIMEOUT: '1',
          ...env,
        },
      }
    );
    return {
      status: Number(result.stdout.match(/__STATUS__(\d+)/)?.[1] ?? result.status),
      output: `${result.stdout}\n${result.stderr}`,
      log: safeRead(log),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function safeRead(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

test('launch retries after a failed splash launch and keeps the boot check', () => {
  const result = runLaunch('retry-then-success');
  assert.equal(result.status, 0, result.output);
  assert.equal((result.log.match(/simctl bootstatus/g) ?? []).length, 2);
  assert.equal((result.log.match(/simctl launch/g) ?? []).length, 2);
  assert.match(result.log, /simctl launch SIM-1 ie\.jov\.Jovie -ui-testing-splash/);
  assert.match(result.output, /Launch attempt 1\/3/);
  assert.match(result.output, /status 9, bound 1s/);
});

test('launch fails clearly when every bounded attempt fails', () => {
  const result = runLaunch('always-fail');
  assert.notEqual(result.status, 0, result.output);
  assert.equal((result.log.match(/simctl bootstatus/g) ?? []).length, 3);
  assert.equal((result.log.match(/simctl launch/g) ?? []).length, 3);
  assert.match(
    result.output,
    /Unable to launch ie\.jov\.Jovie on SIM-1 for 00-loading after 3 attempts\./
  );
});

test('launch does not call simctl launch until bootstatus succeeds', () => {
  const result = runLaunch('boot-fail');
  assert.notEqual(result.status, 0, result.output);
  assert.equal((result.log.match(/simctl bootstatus/g) ?? []).length, 3);
  assert.equal((result.log.match(/simctl launch/g) ?? []).length, 0);
  assert.match(result.output, /did not report booted via 'simctl bootstatus -b'/);
  assert.match(
    result.output,
    /Unable to launch ie\.jov\.Jovie on SIM-1 for 00-loading after 3 attempts\./
  );
});

test('a hung simctl launch is killed at the bound and retried', () => {
  const result = runLaunch('hang', { IOS_SCREENSHOT_LAUNCH_ATTEMPTS: '2' });
  assert.notEqual(result.status, 0, result.output);
  assert.equal((result.log.match(/simctl launch/g) ?? []).length, 2);
  assert.match(result.output, /status 124, bound 1s/);
  assert.match(
    result.output,
    /Unable to launch ie\.jov\.Jovie on SIM-1 for 00-loading after 2 attempts\./
  );
});

test('a failed launch aborts the caller under set -e', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-screenshot-errexit-'));
  const bin = path.join(root, 'bin');
  const out = path.join(root, 'out');
  const log = path.join(root, 'xcrun.log');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'xcrun'), xcrunStub, { mode: 0o755 });
  try {
    const result = spawnSync(
      'bash',
      [
        '-c',
        [
          'set -euo pipefail',
          'source "$CAPTURE_SCRIPT"',
          'mkdir -p "$OUTPUT_DIR"',
          'launch_for_capture "$UDID" "$NAME" -ui-testing-splash',
          'echo SENTINEL',
        ].join('\n'),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAPTURE_SCRIPT: captureScript,
          IOS_SCREENSHOT_DIR: out,
          UDID: 'SIM-1',
          NAME: '00-loading',
          MODE: 'always-fail',
          LOG: log,
          PATH: `${bin}:${process.env.PATH}`,
          IOS_SCREENSHOT_LAUNCH_TIMEOUT: '1',
          IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT: '1',
          IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT: '1',
          IOS_SCREENSHOT_LAUNCH_ATTEMPTS: '1',
          IOS_SCREENSHOT_LAUNCH_RETRY_DELAY: '0',
          IOS_SCREENSHOT_LAUNCH_TERMINATE_TIMEOUT: '1',
        },
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.doesNotMatch(output, /SENTINEL/);
    assert.match(output, /after 1 attempts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('launch rejects an unbounded boot command before touching the simulator', () => {
  const result = runLaunch('always-fail', {
    IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT: '120',
    IOS_SCREENSHOT_BOOT_COMMAND_TIMEOUT: '120',
  });
  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.log, '');
  assert.match(
    result.output,
    /IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT must be an integer from 1 to 30/
  );
});

test('launch rejects an unbounded attempt count before touching the simulator', () => {
  const result = runLaunch('always-fail', {
    IOS_SCREENSHOT_LAUNCH_ATTEMPTS: '9',
  });
  assert.notEqual(result.status, 0, result.output);
  assert.equal(result.log, '');
  assert.match(
    result.output,
    /IOS_SCREENSHOT_LAUNCH_ATTEMPTS must be an integer from 1 to 3/
  );
});
