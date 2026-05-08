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

  it('does not require binaries in dry-run mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const status = runHermesCliWorker({
      payload: { ...basePayload, dryRun: true },
      workspace: '/repo',
    });

    expect(status).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"dryRun": true')
    );
  });
});
