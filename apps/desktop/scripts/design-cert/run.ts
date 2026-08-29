import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  type DesktopAxElement,
  type DesktopCaptureObservation,
  type DesktopPixelStats,
  evaluateDesktopCapture,
} from './evaluator';
import {
  getDesktopDesignScreenForState,
  getDesktopDesignState,
} from './manifest';

const execFileAsync = promisify(execFile);
const DEFAULT_CALL_TIMEOUT_MS = 60_000;
const DEFAULT_STATE_ID = 'desktop.ovie.metrics-unavailable';
const DEFAULT_BUNDLE_ID = 'app.jov.ie.local';

interface RunnerOptions {
  readonly artifactDir: string;
  readonly bundleId: string;
  readonly pid: number | null;
  readonly windowId: number | null;
  readonly stateId: string;
  readonly socket: string | null;
  readonly ensureOvie: boolean;
  readonly normalizeWindow: boolean;
  readonly cdpPort: number | null;
}

interface RendererTarget {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly url: string;
}

interface CuaWindow {
  readonly window_id: number;
  readonly pid: number;
  readonly app_name: string;
  readonly title: string;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly is_on_screen: boolean;
  readonly on_current_space: boolean;
  readonly z_index: number | null;
}

interface CuaCapture {
  readonly elements?: readonly DesktopAxElement[];
  readonly screenshot_file_path?: string;
  readonly screenshot_frame_valid?: boolean;
  readonly window_bounds?: CuaWindow['bounds'];
}

interface CuaApp {
  readonly bundle_id: string;
  readonly name: string;
  readonly pid: number;
  readonly running: boolean;
}

function readArg(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function parsePositiveInt(value: string | null, name: string): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseCdpPort(value: string | null): number | null {
  const port = parsePositiveInt(value, '--cdp-port');
  if (port !== null && port > 65_535) {
    throw new Error('--cdp-port must be at most 65535.');
  }
  return port;
}

function parseOptions(args: readonly string[]): RunnerOptions {
  const artifactDir = resolve(
    readArg(args, '--artifact-dir') ??
      join(process.cwd(), 'artifacts', 'desktop-design-cert')
  );
  return {
    artifactDir,
    bundleId: readArg(args, '--bundle-id') ?? DEFAULT_BUNDLE_ID,
    pid: parsePositiveInt(readArg(args, '--pid'), '--pid'),
    windowId: parsePositiveInt(readArg(args, '--window-id'), '--window-id'),
    stateId: readArg(args, '--state') ?? DEFAULT_STATE_ID,
    socket: readArg(args, '--socket'),
    ensureOvie: args.includes('--ensure-ovie'),
    normalizeWindow: args.includes('--normalize-window'),
    cdpPort: parseCdpPort(readArg(args, '--cdp-port')),
  };
}

export function selectRendererTargets(
  input: unknown
): readonly RendererTarget[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap(target => {
    if (
      !target ||
      typeof target !== 'object' ||
      typeof target.id !== 'string' ||
      typeof target.type !== 'string' ||
      typeof target.title !== 'string' ||
      typeof target.url !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: target.id,
        type: target.type,
        title: target.title,
        url: target.url,
      },
    ];
  });
}

async function readRendererTargets(
  port: number
): Promise<readonly RendererTarget[]> {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`CDP target inventory returned HTTP ${response.status}.`);
  }
  return selectRendererTargets(await response.json());
}

async function waitForPath(path: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await stat(path);
      return;
    } catch {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
    }
  }
  throw new Error(`Timed out waiting for CUA socket: ${path}`);
}

async function stopDaemon(
  daemon: ChildProcess,
  tempDirectory: string
): Promise<void> {
  if (daemon.exitCode === null && daemon.signalCode === null) {
    daemon.kill('SIGTERM');
  }
  await rm(tempDirectory, { recursive: true, force: true });
}

async function startIsolatedDaemon(): Promise<{
  readonly socket: string;
  readonly daemon: ChildProcess;
  readonly tempDirectory: string;
}> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'jovie-design-cert-'));
  const socket = join(tempDirectory, 'cua.sock');
  const binary = process.env.JOVIE_CUA_DRIVER_BIN ?? 'cua-driver';
  const daemon = spawn(binary, ['serve', '--socket', socket], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await waitForPath(socket);
  return { socket, daemon, tempDirectory };
}

async function callCua<T>(
  socket: string,
  tool: string,
  input: object,
  timeoutMs = DEFAULT_CALL_TIMEOUT_MS
): Promise<T> {
  const binary = process.env.JOVIE_CUA_DRIVER_BIN ?? 'cua-driver';
  const { stdout } = await execFileAsync(
    binary,
    ['call', tool, JSON.stringify(input), '--socket', socket],
    { timeout: timeoutMs, maxBuffer: 24 * 1024 * 1024 }
  );
  return JSON.parse(stdout) as T;
}

export function selectMainWindow(
  windows: readonly CuaWindow[],
  requestedWindowId: number | null
): CuaWindow | null {
  if (requestedWindowId !== null) {
    return (
      windows.find(window => window.window_id === requestedWindowId) ?? null
    );
  }
  const candidates = windows.filter(
    window => window.is_on_screen && window.on_current_space
  );
  return (
    candidates.sort((left, right) => {
      const areaDelta =
        right.bounds.width * right.bounds.height -
        left.bounds.width * left.bounds.height;
      if (areaDelta !== 0) return areaDelta;
      return (right.z_index ?? -1) - (left.z_index ?? -1);
    })[0] ?? null
  );
}

async function resolvePid(
  socket: string,
  bundleId: string,
  requestedPid: number | null
): Promise<{ readonly pid: number; readonly appName: string } | null> {
  if (requestedPid !== null) {
    return { pid: requestedPid, appName: bundleId };
  }
  const response = await callCua<{ readonly apps: readonly CuaApp[] }>(
    socket,
    'list_apps',
    {}
  );
  const app = response.apps.find(candidate => candidate.bundle_id === bundleId);
  if (!app?.running || app.pid <= 0) return null;
  return { pid: app.pid, appName: app.name };
}

async function pixelStats(path: string): Promise<DesktopPixelStats> {
  const image = sharp(path);
  const [metadata, stats] = await Promise.all([
    image.metadata(),
    image.stats(),
  ]);
  const [red, green, blue] = stats.channels;
  const meanLuma =
    0.2126 * (red?.mean ?? 0) +
    0.7152 * (green?.mean ?? 0) +
    0.0722 * (blue?.mean ?? 0);
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    entropy: stats.entropy,
    meanLuma,
    maxChannelStdDev: Math.max(
      red?.stdev ?? 0,
      green?.stdev ?? 0,
      blue?.stdev ?? 0
    ),
  };
}

function safeArtifactName(stateId: string): string {
  return stateId.replace(/[^a-z0-9.-]+/gi, '-');
}

async function runWithSocket(
  options: RunnerOptions,
  socket: string
): Promise<number> {
  const registeredState = getDesktopDesignState(options.stateId);
  if (!registeredState) {
    throw new Error(`Unknown desktop design state: ${options.stateId}`);
  }
  const registeredScreen = getDesktopDesignScreenForState(options.stateId);
  const rendererTargets =
    options.cdpPort === null ? [] : await readRendererTargets(options.cdpPort);
  await mkdir(options.artifactDir, { recursive: true });

  const app = await resolvePid(socket, options.bundleId, options.pid);
  if (!app) {
    const receipt = {
      schema: 'desktop-design-cert-receipt/v1',
      outcome: 'blocked',
      stateId: options.stateId,
      bundleId: options.bundleId,
      instrumentationBlockers: [
        'The exact bundle is not running. Start the local bundle, retain its PID, and rerun.',
      ],
    };
    await writeFile(
      join(options.artifactDir, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
      'utf8'
    );
    console.log(JSON.stringify(receipt));
    return 2;
  }

  const windowResponse = await callCua<{
    readonly windows: readonly CuaWindow[];
  }>(socket, 'list_windows', { pid: app.pid, on_screen_only: false });
  const window = selectMainWindow(windowResponse.windows, options.windowId);
  if (!window) {
    const receipt = {
      schema: 'desktop-design-cert-receipt/v1',
      outcome: 'fail',
      stateId: options.stateId,
      bundleId: options.bundleId,
      pid: app.pid,
      failures: [
        {
          invariant: 'shell-active',
          screenState: options.stateId,
          owner: 'Desktop shell owner — apps/desktop',
          evidence: 'The process was alive but no main window was found.',
          nextProof: 'Restore the same process window and rerun.',
        },
      ],
    };
    await writeFile(
      join(options.artifactDir, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
      'utf8'
    );
    console.log(JSON.stringify(receipt));
    return 1;
  }

  if (options.normalizeWindow) {
    await callCua(socket, 'set_window_frame', {
      pid: app.pid,
      window_id: window.window_id,
      x: 32,
      y: 48,
      width: 1440,
      height: 900,
      session: 'jovie-design-cert',
    });
  }

  if (options.ensureOvie) {
    await callCua(socket, 'get_window_state', {
      pid: app.pid,
      window_id: window.window_id,
      include_screenshot: false,
      max_depth: 3,
      max_elements: 250,
      session: 'jovie-design-cert',
    });
    await callCua(socket, 'invoke_menu', {
      pid: app.pid,
      window_id: window.window_id,
      path: [window.app_name, 'Ovie'],
      session: 'jovie-design-cert',
    });
    await new Promise(resolveDelay => setTimeout(resolveDelay, 750));
  }

  const stem = safeArtifactName(options.stateId);
  const screenshotPath = join(options.artifactDir, `${stem}.png`);
  const capture = await callCua<CuaCapture>(socket, 'get_window_state', {
    pid: app.pid,
    window_id: window.window_id,
    screenshot_out_file: screenshotPath,
    max_depth: 3,
    max_elements: 250,
    session: 'jovie-design-cert',
  });
  const stats = capture.screenshot_file_path
    ? await pixelStats(capture.screenshot_file_path)
    : null;
  const observation: DesktopCaptureObservation = {
    stateId: options.stateId,
    processAlive: true,
    windowFound: true,
    windowOnScreen: window.is_on_screen && window.on_current_space,
    windowBounds: window.bounds,
    screenshotFrameValid: capture.screenshot_frame_valid === true,
    pixelStats: stats,
    elements: capture.elements ?? [],
  };
  const evaluation = evaluateDesktopCapture(observation);
  const screenshotSha256 = capture.screenshot_file_path
    ? createHash('sha256')
        .update(await readFile(capture.screenshot_file_path))
        .digest('hex')
    : null;
  const receipt = {
    schema: 'desktop-design-cert-receipt/v1',
    capturedAt: new Date().toISOString(),
    outcome: evaluation.outcome,
    stateId: options.stateId,
    stateLabel: registeredState.label,
    renderer: {
      expectedRoute: registeredScreen?.route ?? null,
      cdpPort: options.cdpPort,
      targets: rendererTargets,
    },
    proofTier: options.bundleId.endsWith('.staging')
      ? 'staging-runtime'
      : 'local-runtime',
    bundleId: options.bundleId,
    pid: app.pid,
    window: {
      id: window.window_id,
      title: window.title,
      bounds: capture.window_bounds ?? window.bounds,
      onScreen: window.is_on_screen,
      onCurrentSpace: window.on_current_space,
    },
    screenshot: capture.screenshot_file_path
      ? {
          file: basename(capture.screenshot_file_path),
          sha256: screenshotSha256,
          frameValid: capture.screenshot_frame_valid === true,
          stats,
        }
      : null,
    observedLabels: evaluation.observedLabels,
    failures: evaluation.failures,
    instrumentationBlockers: evaluation.instrumentationBlockers,
    nextProof: registeredState.nextProof,
  };
  await writeFile(
    join(options.artifactDir, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(receipt));
  return evaluation.outcome === 'pass'
    ? 0
    : evaluation.outcome === 'blocked'
      ? 2
      : 1;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.socket) {
    process.exitCode = await runWithSocket(options, options.socket);
    return;
  }

  const isolated = await startIsolatedDaemon();
  try {
    process.exitCode = await runWithSocket(options, isolated.socket);
  } finally {
    await stopDaemon(isolated.daemon, isolated.tempDirectory);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ outcome: 'blocked', error: message }));
    process.exitCode = 2;
  });
}
