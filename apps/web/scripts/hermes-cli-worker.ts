#!/usr/bin/env tsx

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeHermesAllowedPaths } from '../lib/hermes/allowed-paths';
import type { HermesCliRuntime, HermesDispatchPayload } from '../types/ai-ops';

interface RuntimeCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly stdin: string | null;
}

interface WorkerRunOptions {
  readonly payload: HermesDispatchPayload;
  readonly workspace: string;
  readonly dryRun?: boolean;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
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
    allowedPaths: normalizeHermesAllowedPaths(
      asStringArray(input.allowedPaths)
    ),
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

export function runHermesCliWorker({
  payload,
  workspace,
  dryRun,
}: WorkerRunOptions): number {
  const prompt = buildHermesWorkerPrompt(payload);
  const command = buildRuntimeCommand(payload.runtime, prompt, workspace);
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

  if (!runtimeAvailable(command.executable)) {
    console.error(
      `Hermes runtime '${payload.runtime}' requires '${command.executable}' on PATH.`
    );
    return 127;
  }

  const result = spawnSync(command.executable, [...command.args], {
    cwd: workspace,
    env: {
      ...process.env,
      JOVIE_AGENT_PROFILE: 'coder',
      HERMES_DISPATCH_ID: payload.dispatchId,
      HERMES_SOURCE_URL: payload.sourceUrl ?? '',
    },
    input: command.stdin ?? undefined,
    stdio: command.stdin ? ['pipe', 'inherit', 'inherit'] : 'inherit',
  });

  return result.status ?? 1;
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

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = readPayload(args);
    process.exitCode = runHermesCliWorker({
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
  main();
}
