#!/usr/bin/env node
/**
 * Capture a bounded memory baseline for the real Electron desktop shell.
 *
 * This is evidence, not a leak detector: RSS/footprint growth is a regression
 * signal, while native leak proof requires macOS vmmap support.
 */

import { execFile, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const defaultOutputRoot = path.join(
  repoRoot,
  'artifacts/desktop-test-results/memory-baseline'
);
const MAX_GROWTH_PERCENT = Number.parseFloat(
  process.env.JOVIE_DESKTOP_MEMORY_MAX_GROWTH_PERCENT ?? '20'
);
const SAMPLE_COUNT = Number.parseInt(
  process.env.JOVIE_DESKTOP_MEMORY_SAMPLES ?? '3',
  10
);
const SAMPLE_INTERVAL_MS = Number.parseInt(
  process.env.JOVIE_DESKTOP_MEMORY_INTERVAL_MS ?? '2000',
  10
);
const SETTLE_MS = Number.parseInt(
  process.env.JOVIE_DESKTOP_MEMORY_SETTLE_MS ?? '5000',
  10
);
const LIFECYCLE_TIMEOUT_MS = Number.parseInt(
  process.env.JOVIE_DESKTOP_MEMORY_TIMEOUT_MS ?? '90000',
  10
);

function parseProcessTable(output) {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) return [];
      const [, pid, ppid, rssKb, command] = match;
      const role = /--type=renderer\b/.test(command)
        ? 'renderer'
        : /(?:^|[\\/])electron(?:$|[.\\s/])/i.test(command)
          ? 'main'
          : 'other';
      return [
        {
          pid: Number(pid),
          ppid: Number(ppid),
          rssKb: Number(rssKb),
          command,
          role,
        },
      ];
    });
}

function parsePhysicalFootprint(output) {
  const match = output.match(
    /Physical footprint:\s*([0-9]+(?:\.[0-9]+)?)\s*([KMG])/i
  );
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  return value / ({ K: 1000, M: 1, G: 1000 }[unit] ?? 1);
}

function classifyRun({
  growthPercent,
  nativeFootprintAvailable,
  childProcessesClean,
}) {
  if (!childProcessesClean || growthPercent > MAX_GROWTH_PERCENT)
    return 'regression detected';
  if (!nativeFootprintAvailable) return 'native leak proof unavailable';
  return 'baseline captured';
}

function renderSummary(metadata) {
  const samples = metadata.samples ?? [];
  const sampleLines = samples
    .map(sample => {
      const footprint =
        sample.physicalFootprintMb == null
          ? 'unavailable'
          : `${sample.physicalFootprintMb.toFixed(2)} MB`;
      return `| ${sample.index} | ${sample.mainRssMb.toFixed(2)} MB | ${sample.rendererRssMb.toFixed(2)} MB | ${footprint} |`;
    })
    .join('\n');
  return `# macOS/Electron Memory Baseline\n\n- Status: **${metadata.status}**\n- Git head: \`${metadata.gitHead}\`\n- Samples: ${metadata.samples.length}\n- Growth threshold: ${metadata.thresholdPercent}%\n- Main RSS growth: ${metadata.growth.mainRssPercent.toFixed(2)}%\n- Renderer RSS growth: ${metadata.growth.rendererRssPercent.toFixed(2)}%\n- Physical footprint growth: ${metadata.growth.physicalFootprintPercent == null ? 'unavailable' : `${metadata.growth.physicalFootprintPercent.toFixed(2)}%`}\n- Native footprint available: ${metadata.nativeFootprintAvailable ? 'yes' : 'no'}\n- Child processes clean after shutdown: ${metadata.childProcessesClean ? 'yes' : 'no'}\n\n## Samples\n\n| Sample | Main RSS | Renderer RSS | Physical footprint |\n| ---: | ---: | ---: | ---: |\n${sampleLines}\n\n## Interpretation\n\n- **baseline captured** means bounded samples stayed under the configured growth threshold and native footprint evidence was available.\n- **regression detected** means growth exceeded the threshold or the shell left child processes behind.\n- **native leak proof unavailable** means the shell ran and was cleaned up, but macOS native footprint tooling was unavailable; this is not proof that no leak exists.\n`;
}

async function writeArtifacts(outputDir, metadata, summary) {
  await mkdir(outputDir, { recursive: true });
  const metadataPath = path.join(outputDir, 'metadata.json');
  const summaryPath = path.join(outputDir, 'summary.md');
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(summaryPath, summary);
  return { metadata: metadataPath, summary: summaryPath };
}

async function processTable() {
  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,rss=,command=',
  ]);
  return parseProcessTable(stdout);
}

function descendantsOf(processes, rootPid) {
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (descendants.has(process.ppid) && !descendants.has(process.pid)) {
        descendants.add(process.pid);
        changed = true;
      }
    }
  }
  return processes.filter(process => descendants.has(process.pid));
}

async function footprintFor(pid) {
  if (platform() !== 'darwin') return null;
  try {
    const { stdout, stderr } = await execFileAsync('vmmap', [
      '-summary',
      String(pid),
    ]);
    return parsePhysicalFootprint(`${stdout}\n${stderr}`);
  } catch {
    return null;
  }
}

async function sampleShell(launcherPid, index) {
  const processes = descendantsOf(await processTable(), launcherPid);
  const main = processes.find(process => process.role === 'main');
  const renderers = processes.filter(process => process.role === 'renderer');
  if (!main)
    throw new Error(
      'Electron main process was not found below launch-electron'
    );
  const mainFootprintMb = await footprintFor(main.pid);
  const rendererFootprints = await Promise.all(
    renderers.map(process => footprintFor(process.pid))
  );
  return {
    index,
    capturedAt: new Date().toISOString(),
    mainPid: main.pid,
    rendererPids: renderers.map(process => process.pid),
    mainRssMb: main.rssKb / 1000,
    rendererRssMb:
      renderers.reduce((sum, process) => sum + process.rssKb, 0) / 1000,
    physicalFootprintMb: [mainFootprintMb, ...rendererFootprints].every(
      value => value == null
    )
      ? null
      : [mainFootprintMb, ...rendererFootprints].reduce(
          (sum, value) => sum + (value ?? 0),
          0
        ),
  };
}

function percentageGrowth(samples, key) {
  const first = samples[0][key];
  const last = Math.max(...samples.map(sample => sample[key] ?? first));
  return first > 0 ? ((last - first) / first) * 100 : 0;
}

async function stopProcessTree(launcherPid) {
  let processes = [];
  try {
    processes = descendantsOf(await processTable(), launcherPid);
  } catch {}
  const pids = processes
    .map(process => process.pid)
    .filter(pid => pid !== process.pid)
    .sort((a, b) => b - a);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  let remaining = [];
  try {
    remaining = descendantsOf(await processTable(), launcherPid).filter(
      process => process.pid !== launcherPid
    );
  } catch {}
  for (const processInfo of remaining) {
    try {
      process.kill(processInfo.pid, 'SIGKILL');
    } catch {}
  }
  await new Promise(resolve => setTimeout(resolve, 250));
  try {
    const current = await processTable();
    return (
      descendantsOf(current, launcherPid).filter(
        processInfo => processInfo.pid !== launcherPid
      ).length === 0
    );
  } catch {
    return true;
  }
}

async function gitHead() {
  try {
    return (
      await execFileAsync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'])
    ).stdout.trim();
  } catch {
    return 'unknown';
  }
}

async function main() {
  if (process.platform !== 'darwin')
    console.warn(
      '[desktop-memory] native vmmap evidence is unavailable off macOS'
    );
  if (!Number.isFinite(MAX_GROWTH_PERCENT) || MAX_GROWTH_PERCENT < 0)
    throw new Error('JOVIE_DESKTOP_MEMORY_MAX_GROWTH_PERCENT must be >= 0');
  if (!Number.isInteger(SAMPLE_COUNT) || SAMPLE_COUNT < 2)
    throw new Error('JOVIE_DESKTOP_MEMORY_SAMPLES must be >= 2');
  const outputRoot =
    process.env.JOVIE_DESKTOP_MEMORY_RESULTS_DIR ?? defaultOutputRoot;
  const runDir = path.join(
    outputRoot,
    `Jovie-desktop-memory-baseline-${new Date().toISOString().replaceAll(':', '-')}`
  );
  const logPath = path.join(runDir, 'electron.log');
  await mkdir(runDir, { recursive: true });
  const logHandle = openSync(logPath, 'w');
  const launcher = spawn(
    'pnpm',
    [
      '--dir',
      path.join(repoRoot, 'apps/desktop'),
      'run',
      'dev',
      '--',
      '--disable-gpu',
    ],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        ELECTRON_ENV: 'local',
        ELECTRON_APP_URL:
          process.env.ELECTRON_APP_URL ?? 'http://127.0.0.1:3112',
      },
      stdio: ['ignore', logHandle, logHandle],
    }
  );
  closeSync(logHandle);
  if (!launcher.pid) throw new Error('Failed to start desktop shell');
  const deadline = Date.now() + LIFECYCLE_TIMEOUT_MS;
  const samples = [];
  let lifecycleError = null;
  try {
    while (Date.now() < deadline) {
      try {
        await sampleShell(launcher.pid, 0);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      samples.push(await sampleShell(launcher.pid, index + 1));
      if (index + 1 < SAMPLE_COUNT)
        await new Promise(resolve => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }
  } catch (error) {
    lifecycleError = error instanceof Error ? error.message : String(error);
  } finally {
    const childProcessesClean = await stopProcessTree(launcher.pid);
    const growth =
      samples.length > 0
        ? {
            mainRssPercent: percentageGrowth(samples, 'mainRssMb'),
            rendererRssPercent: percentageGrowth(samples, 'rendererRssMb'),
            physicalFootprintPercent:
              samples[0].physicalFootprintMb == null
                ? null
                : percentageGrowth(samples, 'physicalFootprintMb'),
          }
        : {
            mainRssPercent: 0,
            rendererRssPercent: 0,
            physicalFootprintPercent: null,
          };
    const nativeFootprintAvailable = samples.some(
      sample => sample.physicalFootprintMb != null
    );
    const status = lifecycleError
      ? 'regression detected'
      : classifyRun({
          growthPercent: Math.max(
            growth.mainRssPercent,
            growth.rendererRssPercent,
            growth.physicalFootprintPercent ?? 0
          ),
          nativeFootprintAvailable,
          childProcessesClean,
        });
    const metadata = {
      schemaVersion: 1,
      status,
      platform: process.platform,
      gitHead: await gitHead(),
      thresholdPercent: MAX_GROWTH_PERCENT,
      sampleCount: SAMPLE_COUNT,
      samples,
      growth,
      nativeFootprintAvailable,
      childProcessesClean,
      lifecycleError,
      electronLog: logPath,
    };
    const artifacts = await writeArtifacts(
      runDir,
      metadata,
      renderSummary(metadata)
    );
    console.log(JSON.stringify({ ...metadata, artifacts }, null, 2));
    if (launcher.exitCode === null) launcher.kill('SIGTERM');
    if (status === 'regression detected') process.exitCode = 1;
  }
}

export {
  classifyRun,
  descendantsOf,
  parsePhysicalFootprint,
  parseProcessTable,
  renderSummary,
  writeArtifacts,
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main().catch(error => {
    console.error(`[desktop-memory] ${error.message}`);
    process.exitCode = 1;
  });
