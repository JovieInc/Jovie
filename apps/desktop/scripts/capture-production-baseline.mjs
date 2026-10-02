#!/usr/bin/env node
/** Post-readiness evidence from the installed app; never a startup benchmark. */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { descendantsOf } from './capture-memory-baseline.mjs';
import { parsePackagedDesktopIdentity } from './desktop-dogfood-lib.mjs';

const exec = promisify(execFile);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const ROLES = ['main', 'renderer', 'gpu', 'utility', 'other'];
const SCENARIOS = [
  'foreground-idle',
  'hidden-idle',
  'foreground-streaming',
  'hidden-streaming',
];
const SOFTWARE_OR_DEBUG_LAUNCH =
  /(?:^|\s)--(?:disable-gpu(?:-compositing)?|disable-hardware-acceleration|use-(?:gl|angle)=(?:swiftshader(?:-webgl)?|osmesa)|headless\S*|remote-debugging\S*)(?:\s|=|$)/u;
const ALTERED_LAUNCH =
  /(?:^|\s)--(?:disable-gpu\S*|disable-hardware-acceleration|use-gl|use-angle|headless\S*|remote-debugging\S*)(?:\s|=|$)/u;

export function parseOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      app: { type: 'string', default: '/Applications/Jovie.app' },
      pid: { type: 'string' },
      messages: { type: 'string' },
      samples: { type: 'string', default: '10' },
      scenario: { type: 'string', default: 'foreground-idle' },
      'interval-ms': { type: 'string', default: '2000' },
      output: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) return { help: true };
  const boundedInteger = (value, name, min, max) => {
    const number = Number(value);
    if (
      !/^\d+$/u.test(value ?? '') ||
      !Number.isSafeInteger(number) ||
      number < min ||
      number > max
    ) {
      throw new Error(`${name} must be an integer from ${min} to ${max}`);
    }
    return number;
  };
  const options = {
    appPath: path.resolve(values.app),
    scenario: values.scenario,
    mainPid: boundedInteger(values.pid, '--pid', 1, 2147483647),
    messageCount: boundedInteger(values.messages, '--messages', 20, 2000),
    sampleCount: boundedInteger(values.samples, '--samples', 2, 60),
    intervalMs: boundedInteger(
      values['interval-ms'],
      '--interval-ms',
      250,
      10000
    ),
    outputDir: path.resolve(
      values.output ??
        path.join(
          repoRoot,
          'artifacts/desktop-test-results/production-baseline',
          new Date().toISOString().replaceAll(':', '-')
        )
    ),
  };
  if (!SCENARIOS.includes(options.scenario))
    throw new Error(`--scenario must be ${SCENARIOS.join(', ')}`);
  if (![20, 200, 2000].includes(options.messageCount))
    throw new Error('--messages must be 20, 200, or 2000');
  if (!options.appPath.endsWith('.app'))
    throw new Error('--app must name an installed .app bundle');
  return options;
}

export function parseProductionProcesses(output) {
  return output.split('\n').flatMap(line => {
    const match = line
      .trim()
      .match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(.+)$/u);
    if (!match) return [];
    const [, pid, ppid, rssKiB, cpuPercent, command] = match;
    return [
      {
        pid: Number(pid),
        ppid: Number(ppid),
        rssKiB: Number(rssKiB),
        cpuPercent: Number(cpuPercent),
        command,
      },
    ];
  });
}

export function summarizeProcesses(processes, mainPid, executable) {
  const tree = descendantsOf(processes, mainPid);
  const main = tree.find(row => row.pid === mainPid);
  if (
    !main ||
    !(main.command === executable || main.command.startsWith(`${executable} `))
  ) {
    throw new Error(
      'The selected main PID no longer matches the installed app executable'
    );
  }
  if (
    ALTERED_LAUNCH.test(main.command) ||
    tree.some(row => SOFTWARE_OR_DEBUG_LAUNCH.test(row.command))
  ) {
    throw new Error(
      'GPU overrides, headless mode, and remote debugging are not representative production launches'
    );
  }
  const byRole = Object.fromEntries(
    ROLES.map(role => [role, { pids: [], rssMiB: 0, cpuPercent: 0 }])
  );
  const attributed = tree.map(row => {
    const type = row.command.match(/(?:^|\s)--type=([^\s]+)/u)?.[1];
    const role =
      row.pid === mainPid
        ? 'main'
        : type === 'renderer'
          ? 'renderer'
          : type === 'gpu-process'
            ? 'gpu'
            : type === 'utility'
              ? 'utility'
              : 'other';
    const bucket = byRole[role];
    bucket.pids.push(row.pid);
    bucket.rssMiB += row.rssKiB / 1024;
    bucket.cpuPercent += row.cpuPercent;
    // Commands may contain URLs or user data. Never persist the process table.
    return {
      pid: row.pid,
      role,
      rssMiB: row.rssKiB / 1024,
      cpuPercent: row.cpuPercent,
    };
  });
  if (!byRole.renderer.pids.length || !byRole.gpu.pids.length) {
    throw new Error(
      'Expected renderer and GPU processes are missing; no representative sample was captured'
    );
  }
  return {
    byRole,
    processes: attributed,
    totalRssMiB: attributed.reduce((sum, row) => sum + row.rssMiB, 0),
    totalCpuPercent: attributed.reduce((sum, row) => sum + row.cpuPercent, 0),
  };
}

export function confirmReadiness(
  answer,
  scenario,
  confirmedAt = new Date().toISOString()
) {
  if (answer.trim() !== 'ready')
    throw new Error(
      'Usable authenticated chat was not confirmed; sampling cancelled'
    );
  return {
    method: 'operator-confirmed',
    confirmedAt,
    authenticatedChat: true,
    composerTypedAndCleared: true,
    conversationLoaded: true,
    workState: scenario.endsWith('-streaming')
      ? 'response-streaming-at-confirmation'
      : 'idle-at-confirmation',
  };
}

export async function collectBaseline({
  identity,
  options,
  executable,
  confirm,
  readProcesses,
  prepareScenario,
  readVisibility,
  wait = delay,
}) {
  const report = {
    schema: 'jovie-desktop-production-baseline/v1',
    status: 'incomplete',
    scenario: options.scenario,
    nativeBuild: identity,
    host: {
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
    },
    fixture: {
      messageCount: options.messageCount,
      source: 'operator-reported',
    },
    intervalMs: options.intervalMs,
    gpuEvidence:
      'GPU process present; no launch overrides detected; hardware acceleration is not verified',
    readiness: null,
    samples: [],
    error: null,
  };
  try {
    // Validate the target before asking the operator, then again after readiness.
    summarizeProcesses(await readProcesses(), options.mainPid, executable);
    report.readiness = confirmReadiness(await confirm(), options.scenario);
    await prepareScenario();
    await wait(1000);
    for (let index = 0; index < options.sampleCount; index += 1) {
      const visibility = await readVisibility();
      const expectedVisibility = options.scenario.startsWith('hidden-')
        ? 'hidden'
        : 'foreground';
      if (visibility !== expectedVisibility)
        throw new Error(
          `Selected app visibility is ${visibility}; expected ${expectedVisibility}`
        );
      const sample = summarizeProcesses(
        await readProcesses(),
        options.mainPid,
        executable
      );
      report.samples.push({
        index: index + 1,
        capturedAt: new Date().toISOString(),
        visibility,
        ...sample,
      });
      if (index + 1 < options.sampleCount) await wait(options.intervalMs);
    }
    report.status = 'baseline-captured';
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
  return report;
}

export function renderProductionSummary(report) {
  const rows = report.samples
    .flatMap(sample =>
      ROLES.map(role => {
        const bucket = sample.byRole[role];
        return `| ${sample.index} | ${role} | ${bucket.pids.length} | ${bucket.rssMiB.toFixed(2)} | ${bucket.cpuPercent.toFixed(1)} |`;
      })
    )
    .join('\n');
  return `# Installed desktop resource baseline\n\nStatus: **${report.status}**\n\nScenario: ${report.scenario} (operator reported at confirmation).\n\nPackaged version: ${report.nativeBuild.version}; revision: ${report.nativeBuild.sourceRevision}.\n\nReadiness: ${report.readiness?.method ?? 'not confirmed'}. Fixture: ${report.fixture.messageCount} messages (operator reported).\n\n${report.error ? `Collection error: ${report.error}\n\n` : ''}| Sample | Role | Processes | RSS (MiB) | OS CPU (%) |\n| ---: | --- | ---: | ---: | ---: |\n${rows}\n\nThis is a bounded post-readiness observation, not a startup, interaction-latency, leak, or pass/fail performance gate. Readiness is operator attestation, not an authenticated renderer probe. macOS ps CPU values are OS-defined recent CPU estimates, not interval CPU deltas. Summed RSS includes shared pages and is not unique physical footprint. A GPU process does not prove hardware acceleration. The currently loaded hosted-web revision is unverified. Work state is attested at confirmation only; a stream may finish or another task may begin during sampling.\n`;
}

async function command(file, args) {
  return exec(file, args, {
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' },
  });
}

async function readInstalledIdentity(appPath) {
  const identity = parsePackagedDesktopIdentity(
    JSON.parse(
      await readFile(
        path.join(appPath, 'Contents/Resources/build-identity.json'),
        'utf8'
      )
    )
  );
  if (identity?.channel !== 'production')
    throw new Error('A production packaged build identity is required');
  const plist = path.join(appPath, 'Contents/Info.plist');
  const [bundleId, version, executable] = await Promise.all(
    [
      'CFBundleIdentifier',
      'CFBundleShortVersionString',
      'CFBundleExecutable',
    ].map(async key =>
      (
        await command('plutil', ['-extract', key, 'raw', '-o', '-', plist])
      ).stdout.trim()
    )
  );
  if (
    bundleId !== 'app.jov.ie' ||
    version !== identity.version ||
    !executable ||
    executable !== path.basename(executable)
  )
    throw new Error(
      'Installed bundle metadata does not match the production build identity'
    );
  return {
    identity: { ...identity, bundleId, appPath },
    executable: path.join(appPath, 'Contents/MacOS', executable),
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      'Usage: pnpm desktop:performance --pid <main PID> --messages <20|200|2000> [--app /Applications/Jovie.app] [--scenario foreground-idle|hidden-idle|foreground-streaming|hidden-streaming] [--samples 10] [--interval-ms 2000] [--output <directory>]\nRequires a running production app, macOS, and interactive confirmation. Leaves the app running.\n'
    );
    return;
  }
  if (process.platform !== 'darwin')
    throw new Error(
      'Production desktop sampling requires macOS; no runtime evidence captured'
    );
  if (!process.stdin.isTTY)
    throw new Error(
      'An interactive terminal is required for usable-chat confirmation'
    );
  const { identity, executable } = await readInstalledIdentity(options.appPath);
  const report = await collectBaseline({
    identity,
    options,
    executable,
    readProcesses: async () =>
      parseProductionProcesses(
        (await command('ps', ['-ww', '-axo', 'pid=,ppid=,rss=,%cpu=,command=']))
          .stdout
      ),
    confirm: async () => {
      const terminal = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        return await terminal.question(
          `In the installed app, sign in with an authorized test account, open the ${options.messageCount}-message fixture including tool results and attachments, focus the composer, type and clear a short draft. ${options.scenario.endsWith('-streaming') ? 'Start a response with a controlled test prompt and confirm while it is still streaming.' : 'Wait for all responses/uploads/actions to finish.'} Return here and type ready to confirm all checks. The app will be ${options.scenario.startsWith('hidden-') ? 'hidden' : 'brought forward'} for ${options.scenario} sampling: `,
          { signal: AbortSignal.timeout(300000) }
        );
      } finally {
        terminal.close();
      }
    },
    prepareScenario: async () => {
      await command('osascript', [
        '-e',
        `on run argv
tell application "System Events"
  set targetProcess to first application process whose unix id is (item 1 of argv as integer)
  if item 2 of argv is "hidden" then
    set visible of targetProcess to false
  else
    set visible of targetProcess to true
    set frontmost of targetProcess to true
  end if
end tell
end run`,
        String(options.mainPid),
        options.scenario.startsWith('hidden-') ? 'hidden' : 'foreground',
      ]);
    },
    readVisibility: async () =>
      (
        await command('osascript', [
          '-e',
          `on run argv
tell application "System Events"
  set targetProcess to first application process whose unix id is (item 1 of argv as integer)
  if visible of targetProcess is false then return "hidden"
  tell targetProcess
    if frontmost and (exists window 1) then
      if value of attribute "AXMinimized" of window 1 is false then return "foreground"
    end if
  end tell
end tell
return "other"
end run`,
          String(options.mainPid),
        ])
      ).stdout.trim(),
  });
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(
    path.join(options.outputDir, 'metadata.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  await writeFile(
    path.join(options.outputDir, 'summary.md'),
    renderProductionSummary(report)
  );
  process.stdout.write(
    `[desktop-performance] ${report.status}: ${options.outputDir}\n`
  );
  if (report.status !== 'baseline-captured') process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    process.stderr.write(`[desktop-performance] ${error.message}\n`);
    process.exitCode = 1;
  });
}
