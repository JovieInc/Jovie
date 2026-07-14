#!/usr/bin/env tsx

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  assertOwnedTreeBudget,
  DESIGN_LAB_ARTIFACT_BUDGET,
  ensureOwnedTreeRoot,
  type TreeBudget,
} from '../lib/agent-os/artifact-budget';
import { normalizeHermesAllowedPaths } from '../lib/hermes/allowed-paths';
import type { HermesCliRuntime, HermesDispatchPayload } from '../types/ai-ops';

export interface RuntimeCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly stdin: string | null;
}

export interface WorkerRunOptions {
  readonly payload: HermesDispatchPayload;
  readonly workspace: string;
  readonly dryRun?: boolean;
  readonly designLabArtifactBudget?: TreeBudget;
  readonly monitorIntervalMs?: number;
  readonly runtimeAvailableCheck?: (executable: string) => boolean;
  readonly runtimeCommand?: RuntimeCommand;
}

interface CliArgs {
  readonly payloadFile: string | null;
  readonly payloadJson: string | null;
  readonly workspace: string;
  readonly dryRun: boolean;
}

const RUNTIME_EXECUTABLE: Record<HermesCliRuntime, string> = {
  'codex-cli': 'codex',
  'claude-code': 'claude',
  ruflo: 'ruflo',
};

const VALID_RUNTIMES = new Set<HermesCliRuntime>([
  'codex-cli',
  'claude-code',
  'ruflo',
]);
const DEFAULT_ALLOWED_PATHS = ['apps/web', 'scripts', '.github/workflows'];
const DESIGN_LAB_BUDGET_FAILURE_EXIT_CODE = 78;
const DESIGN_LAB_MONITOR_INTERVAL_MS = 500;
const DESIGN_LAB_RUN_ID_PATTERN =
  /^design-lab-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DESIGN_LAB_MARKER_PATTERN =
  /agentos\/runs\/design-lab\/artifacts\/(design-lab-[0-9a-f-]+)\/complete\.json LAST/g;

export interface DesignLabArtifactMonitor {
  readonly artifactRoot: string;
  readonly runDirectory: string;
  readonly runId: string;
}

export function resolveDesignLabArtifactMonitor(
  payload: HermesDispatchPayload,
  workspace: string
): DesignLabArtifactMonitor | null {
  const matches = [...payload.prompt.matchAll(DESIGN_LAB_MARKER_PATTERN)];
  if (matches.length === 0) return null;
  if (matches.length !== 1) {
    throw new Error(
      'Design Lab payload must name exactly one artifact marker.'
    );
  }
  const runId = matches[0]?.[1] ?? '';
  if (!DESIGN_LAB_RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid Design Lab artifact run id: ${runId}`);
  }
  const artifactRoot = resolve(
    workspace,
    'agentos',
    'runs',
    'design-lab',
    'artifacts'
  );
  return {
    artifactRoot,
    runDirectory: resolve(artifactRoot, runId),
    runId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizePayloadAllowedPaths(value: unknown): string[] {
  const allowedPaths = asStringArray(value);
  return allowedPaths.length > 0
    ? normalizeHermesAllowedPaths(allowedPaths)
    : [...DEFAULT_ALLOWED_PATHS];
}

function requireString(
  value: unknown,
  field: keyof HermesDispatchPayload
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Hermes payload missing ${field}`);
  }
  return value;
}

export function parseHermesPayload(input: unknown): HermesDispatchPayload {
  if (!isRecord(input)) {
    throw new Error('Hermes payload must be an object');
  }

  const runtime = requireString(input.runtime, 'runtime') as HermesCliRuntime;
  if (!VALID_RUNTIMES.has(runtime)) {
    throw new Error(`Unsupported Hermes runtime: ${runtime}`);
  }

  return {
    dispatchId: requireString(input.dispatchId, 'dispatchId'),
    source: requireString(
      input.source,
      'source'
    ) as HermesDispatchPayload['source'],
    sourceId: requireString(input.sourceId, 'sourceId'),
    sourceUrl:
      typeof input.sourceUrl === 'string' && input.sourceUrl.length > 0
        ? input.sourceUrl
        : null,
    kind: requireString(input.kind, 'kind') as HermesDispatchPayload['kind'],
    runtime,
    priority:
      typeof input.priority === 'number' && Number.isFinite(input.priority)
        ? input.priority
        : 50,
    skills: asStringArray(input.skills),
    allowedPaths: normalizePayloadAllowedPaths(input.allowedPaths),
    verification: asStringArray(input.verification),
    dryRun: input.dryRun === true,
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
    owner: typeof input.owner === 'string' ? input.owner : null,
    branchName: requireString(input.branchName, 'branchName'),
    requestedAt: requireString(input.requestedAt, 'requestedAt'),
  };
}

export function buildHermesWorkerPrompt(
  payload: HermesDispatchPayload
): string {
  const skillLines = payload.skills
    .map(skill => `- /${skill.replace(/^\//, '')}`)
    .join('\n');
  const allowedPaths = payload.allowedPaths.length
    ? payload.allowedPaths.map(path => `- ${path}`).join('\n')
    : '- Repo-wide, but keep the diff minimal and scoped.';
  const verification = payload.verification.length
    ? payload.verification.map(command => `- ${command}`).join('\n')
    : '- Run the narrowest relevant verification.';

  return `Load gstack. You are a Hermes CLI worker for Jovie.

Set and honor this profile before editing:
JOVIE_AGENT_PROFILE=coder

Use these gstack skills:
${skillLines || '- /autoplan'}

Task:
- Dispatch ID: ${payload.dispatchId}
- Kind: ${payload.kind}
- Source: ${payload.source}:${payload.sourceId}
- Source URL: ${payload.sourceUrl ?? 'none'}
- Owner: ${payload.owner ?? 'HUD'}
- Priority: ${payload.priority}

User prompt:
${payload.prompt || 'Implement the scoped task using the source context.'}

Allowed path guidance:
${allowedPaths}

Verification:
${verification}

Hard requirements:
- Read AGENTS.md/CLAUDE.md and scoped rules before editing.
- Use Node 22.x, pnpm 9.15.4, and run commands from repo root.
- Do not edit drizzle/migrations.
- Do not add biome-ignore comments.
- Keep the change focused and reviewable.
- Do not merge or deploy.
- Do not commit or push; leave changes in the working tree for the Hermes workflow commit step.
- If the task is unsafe or ambiguous, write a short result note and leave code unchanged.
`;
}

export function buildRuntimeCommand(
  runtime: HermesCliRuntime,
  prompt: string,
  workspace: string
): RuntimeCommand {
  if (runtime === 'codex-cli') {
    return {
      executable: RUNTIME_EXECUTABLE[runtime],
      args: [
        'exec',
        '--cd',
        workspace,
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'never',
        '-',
      ],
      stdin: prompt,
    };
  }

  if (runtime === 'claude-code') {
    return {
      executable: RUNTIME_EXECUTABLE[runtime],
      args: [
        '--print',
        '--permission-mode',
        process.env.HERMES_CLAUDE_PERMISSION_MODE ?? 'acceptEdits',
        '--output-format',
        'stream-json',
        prompt,
      ],
      stdin: null,
    };
  }

  return {
    executable: RUNTIME_EXECUTABLE[runtime],
    args: ['swarm', 'start', '-o', prompt, '-s', 'development'],
    stdin: null,
  };
}

export function runtimeAvailable(executable: string): boolean {
  const result = spawnSync('sh', ['-lc', `command -v ${executable}`], {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function waitForChild(child: ChildProcess): Promise<number> {
  return new Promise(resolveStatus => {
    child.once('error', () => resolveStatus(127));
    child.once('close', code => resolveStatus(code ?? 1));
  });
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      (error as NodeJS.ErrnoException).code !== 'ESRCH'
    ) {
      throw error;
    }
  }
}

function processGroupHasActiveMembers(processGroupId: number): boolean {
  const result = spawnSync('ps', ['-axo', 'pid=,pgid=,stat='], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `Unable to inspect Design Lab process group ${processGroupId}`
    );
  }

  return result.stdout.split('\n').some(line => {
    const [pidText, groupText, state = ''] = line.trim().split(/\s+/u);
    const pid = Number(pidText);
    const group = Number(groupText);
    return (
      Number.isSafeInteger(pid) &&
      pid > 0 &&
      group === processGroupId &&
      !state.startsWith('Z')
    );
  });
}

async function waitForProcessGroupExit(
  processGroupId: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (processGroupHasActiveMembers(processGroupId)) {
    if (Date.now() >= deadline) return false;
    await delay(25);
  }
  return true;
}

async function terminateDesignLabProcessGroup(
  processGroupId: number
): Promise<void> {
  if (!processGroupHasActiveMembers(processGroupId)) return;
  signalProcessGroup(processGroupId, 'SIGTERM');
  if (await waitForProcessGroupExit(processGroupId, 2_000)) return;
  // The original group has remained continuously active. Re-check membership
  // immediately before escalation so a vanished PGID is never signaled later.
  if (!processGroupHasActiveMembers(processGroupId)) return;
  signalProcessGroup(processGroupId, 'SIGKILL');
  await waitForProcessGroupExit(processGroupId, 2_000);
}

export async function runHermesCliWorker({
  payload,
  workspace,
  dryRun,
  designLabArtifactBudget = DESIGN_LAB_ARTIFACT_BUDGET,
  monitorIntervalMs = DESIGN_LAB_MONITOR_INTERVAL_MS,
  runtimeAvailableCheck = runtimeAvailable,
  runtimeCommand,
}: WorkerRunOptions): Promise<number> {
  const prompt = buildHermesWorkerPrompt(payload);
  const command =
    runtimeCommand ?? buildRuntimeCommand(payload.runtime, prompt, workspace);
  const effectiveDryRun = dryRun === true || payload.dryRun;

  if (effectiveDryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          dispatchId: payload.dispatchId,
          runtime: payload.runtime,
          executable: command.executable,
          args: command.args.map(arg => (arg === prompt ? '<prompt>' : arg)),
          branchName: payload.branchName,
        },
        null,
        2
      )
    );
    return 0;
  }

  if (!runtimeAvailableCheck(command.executable)) {
    console.error(
      `Hermes runtime '${payload.runtime}' requires '${command.executable}' on PATH.`
    );
    return 127;
  }

  const designLabMonitor = resolveDesignLabArtifactMonitor(payload, workspace);
  if (designLabMonitor && process.platform === 'win32') {
    console.error(
      'Design Lab Hermes jobs require POSIX process-group termination for artifact budget enforcement.'
    );
    return DESIGN_LAB_BUDGET_FAILURE_EXIT_CODE;
  }
  if (designLabMonitor) {
    try {
      await ensureOwnedTreeRoot(designLabMonitor.artifactRoot);
      await assertOwnedTreeBudget(
        designLabMonitor.artifactRoot,
        designLabArtifactBudget
      );
    } catch (error) {
      console.error(
        `Design Lab artifact budget rejected before worker start: ${error instanceof Error ? error.message : String(error)}`
      );
      return DESIGN_LAB_BUDGET_FAILURE_EXIT_CODE;
    }
  }

  const child = spawn(command.executable, [...command.args], {
    cwd: workspace,
    detached: designLabMonitor !== null,
    env: {
      ...process.env,
      JOVIE_AGENT_PROFILE: 'coder',
      HERMES_DISPATCH_ID: payload.dispatchId,
      HERMES_SOURCE_URL: payload.sourceUrl ?? '',
    },
    stdio: command.stdin ? ['pipe', 'inherit', 'inherit'] : 'inherit',
  });
  if (command.stdin) child.stdin?.end(command.stdin);
  const childExited = waitForChild(child);

  if (!designLabMonitor) return childExited;
  const processGroupId = child.pid;
  if (!processGroupId) {
    await childExited;
    console.error('Design Lab worker did not expose a process group id.');
    return DESIGN_LAB_BUDGET_FAILURE_EXIT_CODE;
  }

  let status: number | null = null;
  while (true) {
    if (status === null) {
      const outcome = await Promise.race([
        childExited.then(exitStatus => ({
          kind: 'exit' as const,
          status: exitStatus,
        })),
        delay(monitorIntervalMs).then(() => ({ kind: 'poll' as const })),
      ]);
      if (outcome.kind === 'exit') status = outcome.status;
    } else {
      await delay(monitorIntervalMs);
    }

    try {
      if (status !== null && !processGroupHasActiveMembers(processGroupId)) {
        break;
      }
      await assertOwnedTreeBudget(
        designLabMonitor.artifactRoot,
        designLabArtifactBudget,
        { requireStableSnapshot: false }
      );
    } catch (error) {
      console.error(
        `Design Lab artifact budget exceeded during worker execution: ${error instanceof Error ? error.message : String(error)}`
      );
      await terminateDesignLabProcessGroup(processGroupId);
      return DESIGN_LAB_BUDGET_FAILURE_EXIT_CODE;
    }
  }

  status ??= await childExited;
  try {
    await assertOwnedTreeBudget(
      designLabMonitor.artifactRoot,
      designLabArtifactBudget
    );
  } catch (error) {
    console.error(
      `Design Lab artifact budget exceeded after worker execution: ${error instanceof Error ? error.message : String(error)}`
    );
    return DESIGN_LAB_BUDGET_FAILURE_EXIT_CODE;
  }

  return status;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let payloadFile: string | null = null;
  let payloadJson: string | null = process.env.HERMES_CLIENT_PAYLOAD ?? null;
  let workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--payload-file') {
      payloadFile = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--payload-json') {
      payloadJson = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--workspace') {
      workspace = argv[index + 1] ?? workspace;
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return {
    payloadFile,
    payloadJson,
    workspace: resolve(workspace),
    dryRun,
  };
}

function readPayload(args: CliArgs): HermesDispatchPayload {
  if (args.payloadFile) {
    if (!existsSync(args.payloadFile)) {
      throw new Error(`Payload file not found: ${args.payloadFile}`);
    }
    return parseHermesPayload(
      JSON.parse(readFileSync(args.payloadFile, 'utf8'))
    );
  }

  if (!args.payloadJson) {
    throw new Error(
      'Provide --payload-file, --payload-json, or HERMES_CLIENT_PAYLOAD.'
    );
  }

  return parseHermesPayload(JSON.parse(args.payloadJson));
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = readPayload(args);
    process.exitCode = await runHermesCliWorker({
      payload,
      workspace: args.workspace,
      dryRun: args.dryRun,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main();
}
