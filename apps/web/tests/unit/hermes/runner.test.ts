import { afterEach, describe, expect, it, vi } from 'vitest';
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
  verification: ['pnpm --filter web exec tsc --noEmit'],
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
    expect(prompt).toContain('pnpm --filter web exec tsc --noEmit');
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
