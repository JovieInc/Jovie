import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertHermesChangedFilesAllowed,
  findOutOfScopeHermesChangedFiles,
  normalizeHermesAllowedPaths,
} from '@/lib/hermes/allowed-paths';
import type { HermesDispatchPayload } from '@/types/ai-ops';
import {
  buildHermesWorkerPrompt,
  buildRuntimeCommand,
  parseHermesPayload,
  runHermesCliWorker,
} from '../../../scripts/hermes-cli-worker';

const basePayload: HermesDispatchPayload = {
  dispatchId: 'dispatch-1',
  source: 'linear',
  sourceId: 'JOV-123',
  sourceUrl: 'https://linear.app/jovie/issue/JOV-123/test',
  kind: 'investigation',
  runtime: 'codex-cli',
  priority: 70,
  skills: ['investigate'],
  allowedPaths: ['apps/web'],
  verification: ['pnpm --filter @jovie/web run typecheck -- --pretty false'],
  dryRun: false,
  prompt: 'Find the root cause.',
  owner: 'HUD',
  branchName: 'codex/hermes-investigation-jov-123',
  requestedAt: '2026-05-07T12:00:00.000Z',
};

describe('Hermes CLI worker runner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds prompts with profile and gstack skills', () => {
    const prompt = buildHermesWorkerPrompt(basePayload);

    expect(prompt).toContain('JOVIE_AGENT_PROFILE=coder');
    expect(prompt).toContain('/investigate');
    expect(prompt).toContain('Do not commit or push');
    expect(prompt).toContain(
      'pnpm --filter @jovie/web run typecheck -- --pretty false'
    );
  });

  it('builds Codex CLI commands with prompt on stdin', () => {
    const command = buildRuntimeCommand('codex-cli', 'prompt body', '/repo');

    expect(command.executable).toBe('codex');
    expect(command.args).toContain('exec');
    expect(command.args).toContain('--cd');
    expect(command.args).toContain('/repo');
    expect(command.stdin).toBe('prompt body');
  });

  it('rejects unknown runtimes', () => {
    expect(() =>
      parseHermesPayload({ ...basePayload, runtime: 'unknown' })
    ).toThrow('Unsupported Hermes runtime');
  });

  it('normalizes allowed paths and rejects traversal', () => {
    expect(
      normalizeHermesAllowedPaths(['./apps/web/', '././apps/web', 'apps/web'])
    ).toEqual(['apps/web']);
    expect(() => normalizeHermesAllowedPaths(['../apps/web'])).toThrow(
      'Invalid Hermes allowed path'
    );
  });

  it('defaults empty Hermes worker allowed paths', () => {
    const { allowedPaths: _allowedPaths, ...payloadWithoutAllowedPaths } =
      basePayload;

    expect(
      parseHermesPayload({ ...basePayload, allowedPaths: [] }).allowedPaths
    ).toEqual(['apps/web', 'scripts', '.github/workflows']);
    expect(parseHermesPayload(payloadWithoutAllowedPaths).allowedPaths).toEqual(
      ['apps/web', 'scripts', '.github/workflows']
    );
  });

  it('fails closed when Hermes changes files outside allowed paths', () => {
    expect(
      findOutOfScopeHermesChangedFiles(
        ['apps/web/lib/hermes/dispatch.ts', 'docs/notes.md'],
        ['apps/web']
      )
    ).toEqual(['docs/notes.md']);

    expect(() =>
      assertHermesChangedFilesAllowed(
        ['apps/web/lib/hermes/dispatch.ts', '.github/workflows/ci.yml'],
        ['apps/web']
      )
    ).toThrow('Hermes worker changed files outside allowedPaths');

    expect(() =>
      findOutOfScopeHermesChangedFiles(['apps/web/..'], ['apps/web'])
    ).toThrow('Invalid Hermes changed file path');
  });

  it('does not require binaries in dry-run mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const status = await runHermesCliWorker({
      payload: { ...basePayload, dryRun: true },
      workspace: '/repo',
    });

    expect(status).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"dryRun": true')
    );
  });

  it('terminates a Design Lab worker process group when artifacts grow over budget', async () => {
    if (process.platform === 'win32') return;
    const workspace = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'hermes-design-lab-monitor-'))
    );
    const designRunId = 'design-lab-00000000-0000-4000-8000-000000000001';
    const runDirectory = path.join(
      workspace,
      'agentos',
      'runs',
      'design-lab',
      'artifacts',
      designRunId
    );
    const artifactPath = path.join(runDirectory, 'oversized.bin');
    const pidPath = path.join(workspace, 'grandchild.pid');
    const grandchildScript = [
      "const fs = require('node:fs');",
      `fs.mkdirSync(${JSON.stringify(runDirectory)}, { recursive: true });`,
      `fs.writeFileSync(${JSON.stringify(artifactPath)}, '123456');`,
      'setTimeout(() => process.exit(0), 5000);',
    ].join('');
    const workerScript = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchildScript)}], { stdio: 'ignore' });`,
      `fs.writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
      'setTimeout(() => process.exit(0), 5000);',
    ].join('');

    const originalKill = process.kill.bind(process);
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation((pid, signal) => originalKill(pid, signal));
    try {
      const status = await runHermesCliWorker({
        designLabArtifactBudget: {
          maxBytes: 5,
          maxDirectories: 100,
          maxFiles: 100,
        },
        monitorIntervalMs: 10,
        payload: {
          ...basePayload,
          prompt: `After every output is durably written, write agentos/runs/design-lab/artifacts/${designRunId}/complete.json LAST with exactly {"status":"completed","runId":"${designRunId}"}.`,
        },
        runtimeAvailableCheck: () => true,
        runtimeCommand: {
          args: ['-e', workerScript],
          executable: process.execPath,
          stdin: null,
        },
        workspace,
      });

      expect(status).toBe(78);
      const groupSignals = killSpy.mock.calls
        .filter(([pid]) => typeof pid === 'number' && pid < 0)
        .map(([, signal]) => signal);
      expect(groupSignals).toContain('SIGTERM');
      expect(groupSignals).not.toContain('SIGKILL');
      const grandchildPid = Number(await readFile(pidPath, 'utf8'));
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(() => process.kill(grandchildPid, 0)).toThrow();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('allows gradual below-budget Design Lab writes and never signals a normally closed worker', async () => {
    if (process.platform === 'win32') return;
    const workspace = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'hermes-design-lab-growth-'))
    );
    const designRunId = 'design-lab-00000000-0000-4000-8000-000000000002';
    const artifactPath = path.join(
      workspace,
      'agentos',
      'runs',
      'design-lab',
      'artifacts',
      designRunId,
      'gradual.bin'
    );
    const workerScript = [
      "const fs = require('node:fs');",
      `fs.mkdirSync(${JSON.stringify(path.dirname(artifactPath))}, { recursive: true });`,
      `const target = ${JSON.stringify(artifactPath)};`,
      "fs.writeFileSync(target, '');",
      'let count = 0;',
      "const timer = setInterval(() => { fs.appendFileSync(target, '1'); count += 1; if (count === 10) { clearInterval(timer); } }, 15);",
    ].join('');
    const killSpy = vi.spyOn(process, 'kill');

    try {
      const status = await runHermesCliWorker({
        designLabArtifactBudget: {
          maxBytes: 100,
          maxDirectories: 100,
          maxFiles: 100,
        },
        monitorIntervalMs: 5,
        payload: {
          ...basePayload,
          prompt: `Write agentos/runs/design-lab/artifacts/${designRunId}/complete.json LAST when done.`,
        },
        runtimeAvailableCheck: () => true,
        runtimeCommand: {
          args: ['-e', workerScript],
          executable: process.execPath,
          stdin: null,
        },
        workspace,
      });

      expect(status).toBe(0);
      expect(await readFile(artifactPath, 'utf8')).toBe('1111111111');
      expect(killSpy).not.toHaveBeenCalled();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('keeps monitoring the owned process group after its leader exits', async () => {
    if (process.platform === 'win32') return;
    const workspace = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'hermes-design-lab-background-'))
    );
    const designRunId = 'design-lab-00000000-0000-4000-8000-000000000003';
    const runDirectory = path.join(
      workspace,
      'agentos',
      'runs',
      'design-lab',
      'artifacts',
      designRunId
    );
    const artifactPath = path.join(runDirectory, 'late-oversized.bin');
    const pidPath = path.join(workspace, 'background-writer.pid');
    const backgroundScript = [
      "const fs = require('node:fs');",
      `setTimeout(() => { fs.mkdirSync(${JSON.stringify(runDirectory)}, { recursive: true }); fs.writeFileSync(${JSON.stringify(artifactPath)}, '123456'); }, 75);`,
      'setTimeout(() => process.exit(0), 5000);',
    ].join('');
    const leaderScript = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(backgroundScript)}], { stdio: 'ignore' });`,
      `fs.writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
      'child.unref();',
      'process.exit(0);',
    ].join('');

    try {
      const status = await runHermesCliWorker({
        designLabArtifactBudget: {
          maxBytes: 5,
          maxDirectories: 100,
          maxFiles: 100,
        },
        monitorIntervalMs: 10,
        payload: {
          ...basePayload,
          prompt: `Write agentos/runs/design-lab/artifacts/${designRunId}/complete.json LAST when done.`,
        },
        runtimeAvailableCheck: () => true,
        runtimeCommand: {
          args: ['-e', leaderScript],
          executable: process.execPath,
          stdin: null,
        },
        workspace,
      });

      expect(status).toBe(78);
      const backgroundPid = Number(await readFile(pidPath, 'utf8'));
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(() => process.kill(backgroundPid, 0)).toThrow();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
