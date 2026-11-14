#!/usr/bin/env node
/** Synthetic local-stub evidence only; targets never gate a release. */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  clockTicksPerSecond,
  intervalCpuPercent,
  processSnapshot,
  quitAndInspect,
  summarizeSample,
} from './startup-budget-linux.mjs';

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const require = createRequire(import.meta.url);
export const SAMPLE_TIMES_MS = [5000, 35000];
export const LAUNCH_COUNT = 5;
export const TARGETS = Object.freeze({
  nativeWindowReadyToShowMs: 1000,
  reactMountedMs: 1500,
  processCount: 5,
  mainRssMb: 150,
  treeRssMb: 450,
  idleCpuPercent: 2,
  childrenAfterQuit: 0,
});
const milestones = [
  'nativeWindowReadyToShowMs',
  'reactMountedMs',
  'composerVisibleEditableAfterPaintOpportunityMs',
];

export async function startStub(sourceRevision) {
  const html = `<!doctype html><html><body><textarea autofocus>Startup fixture</textarea>
<script>
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.electronAPI.notifyAppBooted();
  const report = () => window.electronAPI.notifyComposerReadiness('visible-editable');
  report();
  document.addEventListener('visibilitychange', report);
  // The window may become visible after its first hidden paint.
  const retry = setInterval(report, 100);
  setTimeout(() => clearInterval(retry), 2000);
}));
</script></body></html>`;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/api/health/build-info') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ buildId: sourceRevision, sourceRevision }));
    } else if (pathname === '/app/chat') {
      response.setHeader('Content-Type', 'text/html');
      response.end(html);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      ),
  };
}

export function validateReadiness(receipt, mainPid, sourceRevision) {
  if (
    receipt?.schema !== 'jovie-desktop-launch-readiness/v1' ||
    receipt.pid !== mainPid ||
    receipt.nativeBuild?.channel !== 'local' ||
    receipt.nativeBuild?.sourceRevision !== sourceRevision ||
    milestones.some(key => !Number.isFinite(receipt[key]) || receipt[key] < 0)
  )
    throw new Error(
      'Missing, incomplete, or mismatched native readiness receipt'
    );
  return Object.fromEntries(milestones.map(key => [key, receipt[key]]));
}

export async function captureLaunch(index, deps) {
  const record = {
    index,
    status: 'unavailable',
    samples: [],
    readiness: null,
    idleCpuPercent: null,
    cleanup: null,
    error: null,
  };
  const started = deps.now();
  let launcher;
  const initialProcesses = [];
  try {
    launcher = deps.launch();
    initialProcesses.push(
      ...(await deps.snapshot()).filter(row => row.group === launcher.pid)
    );
    for (const target of SAMPLE_TIMES_MS) {
      await deps.wait(Math.max(0, started + target - deps.now()));
      const rows = await deps.snapshot();
      record.samples.push(
        summarizeSample(rows, launcher.pid, deps.now() - started, target)
      );
    }
    record.readiness = await deps.readReceipt();
    validateReadiness(
      record.readiness,
      record.samples[0].mainPid,
      deps.sourceRevision
    );
    record.idleCpuPercent = intervalCpuPercent(
      ...record.samples,
      deps.ticksPerSecond
    );
    record.status = 'captured';
  } catch (error) {
    record.error = error.message;
  } finally {
    if (launcher?.pid) {
      try {
        record.cleanup = await quitAndInspect({
          ...deps,
          launcherPid: launcher.pid,
          mainPid: record.samples.at(-1)?.mainPid,
          known: [
            ...initialProcesses,
            ...record.samples.flatMap(sample => sample.processes),
          ],
        });
        if (record.cleanup.afterCleanup.length)
          throw new Error('Children survived forced cleanup');
      } catch (error) {
        record.status = 'unavailable';
        record.error = error.message;
      }
    }
  }
  record.durationMs = deps.now() - started;
  return record;
}

export function median(values) {
  if (!values.length || values.some(value => !Number.isFinite(value)))
    return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeLaunches(launches) {
  // Never substitute another run for a failed measured launch or drop nulls.
  if (
    launches.length !== LAUNCH_COUNT ||
    launches.some(run => run.status !== 'captured')
  )
    return { status: 'unavailable', medians: null, targetResults: null };
  const measured = launches.slice(1);
  const medians = Object.fromEntries(
    milestones.map(key => [
      key,
      median(measured.map(run => run.readiness[key])),
    ])
  );
  medians.samples = SAMPLE_TIMES_MS.map((targetMs, index) => ({
    targetMs,
    ...Object.fromEntries(
      ['processCount', 'mainRssMb', 'treeRssMb'].map(key => [
        key,
        median(measured.map(run => run.samples[index][key])),
      ])
    ),
  }));
  medians.idleCpuPercent = median(measured.map(run => run.idleCpuPercent));
  medians.childrenAfterQuit = median(
    measured.map(run => run.cleanup.afterQuit.length)
  );
  const results = Object.fromEntries(
    Object.entries(TARGETS).map(([key, limit]) => {
      const value = ['processCount', 'mainRssMb', 'treeRssMb'].includes(key)
        ? Math.max(...medians.samples.map(sample => sample[key]))
        : medians[key];
      return [key, { value, limit, met: value <= limit }];
    })
  );
  // Even a discarded warmup leak is visible; a median must not conceal leaks.
  results.childrenAfterQuit.met = launches.every(
    run => run.cleanup.afterQuit.length === 0
  );
  return { status: 'captured', medians, targetResults: results };
}

export function stageEvents(receipt) {
  return receipt.launches.flatMap(run => {
    const event = {
      schema: 'jovie-stage-event/v1',
      entityType: 'desktop-startup',
      entityId: `${receipt.sourceRevision}:${receipt.startedAt}:${run.index}`,
      stage: 'launch',
      enteredAt: run.startedAt,
      exitedAt: run.finishedAt,
      actor: 'desktop-startup-budget',
      outcome: run.status === 'captured' ? 'completed' : 'failed',
      sourceReceipt: `${receipt.sourceRevision}:${receipt.startedAt}/launch-${run.index}`,
    };
    return [
      event,
      {
        ...event,
        stage: 'finished',
        enteredAt: run.finishedAt,
        exitedAt: run.finishedAt,
      },
    ];
  });
}

export async function main() {
  const output = path.resolve(
    process.env.JOVIE_STARTUP_RESULTS_DIR ??
      path.join(
        desktopRoot,
        '../../artifacts/desktop-test-results/startup-budget'
      )
  );
  await mkdir(output, { recursive: true });
  const receipt = {
    schema: 'jovie-desktop-startup-budget/v1',
    reportOnly: true,
    scenario: 'local-http-stub',
    startedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    launchCount: LAUNCH_COUNT,
    discardFirst: 1,
    sampleTimesMs: SAMPLE_TIMES_MS,
    units: { rss: 'decimal MB', cpu: '% of one logical CPU over T+5s..T+35s' },
    targets: TARGETS,
    launches: [],
    status: 'unavailable',
    error: null,
  };
  let stub;
  try {
    if (process.platform !== 'linux')
      throw new Error('Ubuntu/Linux harness only');
    receipt.sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: desktopRoot,
      encoding: 'utf8',
    }).trim();
    receipt.sourceDirty = Boolean(
      execFileSync('git', ['status', '--porcelain'], {
        cwd: desktopRoot,
        encoding: 'utf8',
      }).trim()
    );
    receipt.electron = require('electron/package.json').version;
    stub = await startStub(receipt.sourceRevision);
    const env = {
      ...process.env,
      ELECTRON_ENV: 'local',
      ELECTRON_APP_URL: stub.url,
      JOVIE_DESKTOP_SOURCE_REVISION: receipt.sourceRevision,
      JOVIE_DEV: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    execFileSync(process.execPath, ['scripts/write-env.mjs'], {
      cwd: desktopRoot,
      env,
      stdio: 'inherit',
    });
    execFileSync('pnpm', ['run', 'compile'], {
      cwd: desktopRoot,
      env,
      stdio: 'inherit',
    });
    receipt.artifactSha256 = Object.fromEntries(
      await Promise.all(
        ['main.js', 'preload.js'].map(async file => [
          file,
          createHash('sha256')
            .update(
              await readFile(path.join(desktopRoot, 'dist-electron', file))
            )
            .digest('hex'),
        ])
      )
    );
    const ticksPerSecond = clockTicksPerSecond();
    for (let index = 1; index <= LAUNCH_COUNT; index++) {
      const home = await mkdtemp(path.join(tmpdir(), 'jovie-startup-'));
      const log = openSync(path.join(output, `launch-${index}.log`), 'w');
      let spawnError;
      try {
        const startedAt = new Date().toISOString();
        const run = await captureLaunch(index, {
          sourceRevision: receipt.sourceRevision,
          ticksPerSecond,
          now: () => performance.now(),
          wait,
          snapshot: processSnapshot,
          signal: (pid, signal) => process.kill(pid, signal),
          launch: () => {
            const child = spawn(
              process.execPath,
              ['scripts/launch-electron.mjs'],
              {
                cwd: desktopRoot,
                detached: true,
                env: { ...env, XDG_CONFIG_HOME: home },
                stdio: ['ignore', log, log],
              }
            );
            child.on('error', error => {
              spawnError = error.message;
            });
            return child;
          },
          readReceipt: async () =>
            JSON.parse(
              await readFile(
                path.join(home, 'Jovie-Local', 'desktop-launch-readiness.json'),
                'utf8'
              )
            ),
        });
        Object.assign(run, { startedAt, finishedAt: new Date().toISOString() });
        if (spawnError) {
          run.status = 'unavailable';
          run.error = spawnError;
        }
        receipt.launches.push(run);
        if (!run.cleanup || run.cleanup.afterCleanup.length) {
          receipt.error = 'Cleanup unverified; further launches aborted';
          break;
        }
      } finally {
        closeSync(log);
        await rm(home, { recursive: true, force: true });
      }
    }
    Object.assign(receipt, summarizeLaunches(receipt.launches));
  } catch (error) {
    receipt.error = error.message;
  } finally {
    await stub?.close();
    receipt.finishedAt = new Date().toISOString();
    await writeFile(
      path.join(output, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    await writeFile(
      path.join(output, 'stage-events.ndjson'),
      stageEvents(receipt)
        .map(event => JSON.stringify(event))
        .join('\n') + '\n'
    );
  }
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
