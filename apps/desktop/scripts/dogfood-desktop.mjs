#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  buildDesktopDogfoodReport,
  createCoverageLedger,
  observationTemplate,
  parsePackagedDesktopIdentity,
  validateObservations,
} from './desktop-dogfood-lib.mjs';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const SHA = /^[0-9a-f]{40}$/u;
const startedAt = new Date();
const gitSha = await command('git', ['rev-parse', '--short=12', 'HEAD'], {
  cwd: repoRoot,
}).then(
  result => result.stdout.trim(),
  () => 'unknown'
);
const runId =
  process.env.JOVIE_DESKTOP_DOGFOOD_SESSION_ID?.trim() ||
  `${startedAt.toISOString().replaceAll(/[-:.]/gu, '').slice(0, 15)}Z-${gitSha}`;
const outputDir = path.resolve(
  process.env.JOVIE_DESKTOP_DOGFOOD_OUTPUT_DIR ??
    path.join(repoRoot, 'artifacts/desktop-dogfood', runId)
);
const screenshotsDir = path.join(outputDir, 'screenshots');
const crashesDir = path.join(outputDir, 'crashes');
fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(crashesDir, { recursive: true });

const appPath = path.resolve(
  process.env.JOVIE_DESKTOP_DOGFOOD_APP_PATH ??
    '/Applications/Jovie Staging.app'
);
const processName = path.basename(appPath, '.app');
const runnerId = process.env.JOVIE_DESKTOP_DOGFOOD_RUNNER_ID?.trim() || null;
const accountRole =
  process.env.JOVIE_DESKTOP_DOGFOOD_ACCOUNT_ROLE?.trim() || null;
const accountFixture =
  process.env.JOVIE_DESKTOP_DOGFOOD_ACCOUNT_FIXTURE?.trim() || null;
const testAccountConfirmed =
  process.env.JOVIE_DESKTOP_DOGFOOD_TEST_ACCOUNT === '1';
const featureFlags = parseFeatureFlags(
  process.env.JOVIE_DESKTOP_DOGFOOD_FEATURE_FLAGS_JSON
);
const blockers = [];

if (process.platform !== 'darwin') {
  blockers.push(
    `host OS is ${process.platform}; a GUI-capable macOS session is required`
  );
}
if (!runnerId) blockers.push('runner ID is unreported');
if (!accountRole) blockers.push('account role is unreported');
if (!accountFixture) blockers.push('test account fixture is unreported');
if (!testAccountConfirmed) {
  blockers.push('authorized staging/test account confirmation is missing');
}
if (featureFlags === null) blockers.push('feature flag snapshot is unreported');

const nativeBuild = await readNativeBuild(appPath, blockers);
const hostedWeb = await readHostedBuild(nativeBuild, blockers);
const captureResult =
  process.platform === 'darwin' && testAccountConfirmed
    ? await captureFirstAppWindow({ appPath, processName, screenshotsDir })
    : {
        ok: false,
        reason: 'capture requires macOS and a confirmed test account',
      };
const capture = captureResult.ok ? captureResult.capture : null;
if (!capture) {
  blockers.push(
    `first app-owned window capture is unavailable: ${captureResult.reason}`
  );
}

const observationsPath = process.env.JOVIE_DESKTOP_DOGFOOD_OBSERVATIONS_PATH;
let observations = [];
if (observationsPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(observationsPath, 'utf8'));
    observations = validateObservations(parsed, outputDir);
  } catch (error) {
    blockers.push(
      `observations rejected: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const coverage = createCoverageLedger({ observations, accountRole });
const crashes = collectCrashes(startedAt, crashesDir);
const runnerStatus =
  blockers.length === 0 &&
  nativeBuild?.provenance === 'verified' &&
  hostedWeb?.commitSha &&
  capture
    ? 'verified'
    : 'unverified';
const session = {
  id: runId,
  runnerId,
  runnerStatus,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  host: os.hostname(),
  os: process.platform,
  environment: nativeBuild?.channel ?? 'unknown',
  accountRole,
  accountFixture,
  featureFlags,
  window: capture?.window ?? null,
  blockers,
};
const artifacts = {
  report: 'report.json',
  session: 'session.json',
  coverage: 'coverage.json',
  observationTemplate: 'observations.template.json',
  firstCapture: capture?.artifact ?? null,
  crashesDir: 'crashes',
};
const report = buildDesktopDogfoodReport({
  generatedAt: new Date().toISOString(),
  session,
  nativeBuild,
  hostedWeb,
  coverage,
  crashes,
  artifacts,
});

writeJson('session.json', session);
writeJson('coverage.json', coverage);
writeJson('observations.template.json', observationTemplate());
writeJson('report.json', report);
process.stdout.write(
  `desktop-dogfood: ${report.verdict} ${report.runnerStatus} tested=${report.coverageSummary.testedStates}/${report.coverageSummary.applicableStates} state-blocked=${report.coverageSummary.blocked} runner-blockers=${report.runnerBlockerCount}\n`
);
process.stdout.write(
  `desktop-dogfood: report=${path.join(outputDir, 'report.json')}\n`
);
process.exitCode = runnerStatus === 'verified' ? 0 : 2;

function writeJson(filename, value) {
  fs.writeFileSync(
    path.join(outputDir, filename),
    `${JSON.stringify(value, null, 2)}\n`
  );
}

function parseFeatureFlags(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) &&
      parsed.every(flag => typeof flag === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function readNativeBuild(targetAppPath, targetBlockers) {
  try {
    const resourcePath = path.join(
      targetAppPath,
      'Contents/Resources/build-identity.json'
    );
    const identity = parsePackagedDesktopIdentity(
      JSON.parse(fs.readFileSync(resourcePath, 'utf8'))
    );
    if (!identity) throw new Error('packaged build identity is invalid');
    const infoPlist = path.join(targetAppPath, 'Contents/Info.plist');
    const [{ stdout: bundleVersion }, { stdout: bundleId }] = await Promise.all(
      [
        command('plutil', [
          '-extract',
          'CFBundleShortVersionString',
          'raw',
          '-o',
          '-',
          infoPlist,
        ]),
        command('plutil', [
          '-extract',
          'CFBundleIdentifier',
          'raw',
          '-o',
          '-',
          infoPlist,
        ]),
      ]
    );
    const expectedBundleId =
      identity.channel === 'staging' ? 'app.jov.ie.staging' : 'app.jov.ie';
    if (bundleVersion.trim() !== identity.version) {
      throw new Error('Info.plist version does not match build identity');
    }
    if (bundleId.trim() !== expectedBundleId) {
      throw new Error('Info.plist bundle ID does not match release channel');
    }
    const asarPath = path.join(targetAppPath, 'Contents/Resources/app.asar');
    const asarSha256 = createHash('sha256')
      .update(fs.readFileSync(asarPath))
      .digest('hex');
    return {
      ...identity,
      bundleId: bundleId.trim(),
      appPath: targetAppPath,
      asarSha256,
    };
  } catch (error) {
    targetBlockers.push(
      `installed build identity unavailable at ${targetAppPath}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

async function readHostedBuild(identity, targetBlockers) {
  const configured = process.env.JOVIE_DESKTOP_DOGFOOD_BASE_URL?.trim();
  const baseUrl =
    configured ||
    (identity?.channel === 'production'
      ? 'https://jov.ie'
      : identity?.channel === 'staging'
        ? 'https://staging.jov.ie'
        : null);
  if (!baseUrl) {
    targetBlockers.push('hosted web base URL is unavailable');
    return null;
  }
  try {
    const response = await fetch(new URL('/api/health/build-info', baseUrl), {
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (
      !body ||
      typeof body.commitSha !== 'string' ||
      !SHA.test(body.commitSha)
    ) {
      throw new Error('response lacks a full commitSha');
    }
    return {
      baseUrl,
      commitSha: body.commitSha,
      deploymentId: body.deploymentId ?? null,
      buildId: body.buildId ?? null,
    };
  } catch (error) {
    targetBlockers.push(
      `hosted web identity unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

async function captureFirstAppWindow(input) {
  try {
    await command('open', [input.appPath]);
    const script = `on run argv
set processName to item 1 of argv
tell application "System Events"
  repeat 120 times
    if exists process processName then
      tell process processName
        set frontmost to true
        if exists window 1 then
          set targetWindow to window 1
          set windowNumber to value of attribute "AXWindowNumber" of targetWindow
          set {windowX, windowY} to position of targetWindow
          set {windowWidth, windowHeight} to size of targetWindow
          return (windowNumber as text) & "," & windowX & "," & windowY & "," & windowWidth & "," & windowHeight
        end if
      end tell
    end if
    delay 0.25
  end repeat
end tell
error "timed out waiting for the app window"
end run`;
    const result = await command(
      'osascript',
      ['-e', script, input.processName],
      {
        timeout: 40_000,
      }
    );
    const [windowId, x, y, width, height] = result.stdout
      .trim()
      .split(',')
      .map(Number);
    if (![windowId, x, y, width, height].every(Number.isFinite)) {
      return {
        ok: false,
        reason: 'Accessibility returned invalid window geometry',
      };
    }
    const screenshotPath = path.join(
      input.screenshotsDir,
      'first-app-capture.png'
    );
    await command('screencapture', [
      '-x',
      '-o',
      `-l${windowId}`,
      screenshotPath,
    ]);
    const bytes = fs.readFileSync(screenshotPath);
    if (
      bytes.length < 1_000 ||
      !bytes.subarray(1, 4).equals(Buffer.from('PNG'))
    ) {
      return {
        ok: false,
        reason: 'Screen Recording returned an invalid or empty PNG',
      };
    }
    const scaleResult = await command('osascript', [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit"); String($.NSScreen.mainScreen.backingScaleFactor)',
    ]).catch(() => ({ stdout: '' }));
    const scale = Number(scaleResult.stdout.trim());
    if (!Number.isFinite(scale) || scale <= 0) {
      return { ok: false, reason: 'display scale could not be measured' };
    }
    return {
      ok: true,
      capture: {
        artifact: 'screenshots/first-app-capture.png',
        window: { id: windowId, x, y, width, height, displayScale: scale },
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectCrashes(runStartedAt, targetDir) {
  const diagnosticDir = path.join(
    os.homedir(),
    'Library/Logs/DiagnosticReports'
  );
  if (!fs.existsSync(diagnosticDir)) return [];
  return fs
    .readdirSync(diagnosticDir)
    .filter(name => /^Jovie.*\.(?:ips|crash)$/u.test(name))
    .filter(
      name => fs.statSync(path.join(diagnosticDir, name)).mtime >= runStartedAt
    )
    .map(name => {
      fs.copyFileSync(
        path.join(diagnosticDir, name),
        path.join(targetDir, name)
      );
      return { process: 'Jovie', report: `crashes/${name}` };
    });
}

async function command(executable, args, options = {}) {
  return await execFileAsync(executable, args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 20_000,
    maxBuffer: 1024 * 1024,
    ...options,
  });
}
