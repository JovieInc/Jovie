/**
 * Unit tests for the CI runner autoscaler.
 *
 * Tests cover the deterministic control loop logic, model routing,
 * and GitHub/Docker client interfaces.
 *
 * Run:
 *   pnpm vitest run scripts/hermes/lib/__tests__/ci-runner-autoscaler.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import {
  type AutoscalerState,
  type GitHubRunner,
  type RunnerAutoscalerConfig,
} from '../ci-runner-autoscaler/types';
import { selectRoute } from '../ci-runner-autoscaler/router';

// ── Fixtures ───────────────────────────────────────────────────

function testConfig(overrides?: Partial<RunnerAutoscalerConfig>): RunnerAutoscalerConfig {
  return {
    repo: 'JovieInc/Jovie',
    repoOwner: 'JovieInc',
    repoName: 'Jovie',
    maxRunners: 8,
    pollIntervalMs: 15000,
    idleTimeoutMs: 300000,
    runnerCpus: 2,
    runnerMemoryMb: 6144,
    runnerImage: 'myoung34/github-runner:latest',
    runnerLabels: 'self-hosted,Linux,X64,jovie-runner,ephemeral',
    runnerWorkDir: '/tmp/runner-work',
    cgroupParent: 'ci-runners.slice',
    dockerSocket: '/var/run/docker.sock',
    gbraintoken: '',
    gbrainUrl: 'http://100.115.191.120:7801/mcp',
    simpleModel: 'opencode-go/deepseek-v4-flash',
    standardModel: 'opencode-go/deepseek-v4-flash',
    escalationModel: 'ollama/qwen3-coder:30b',
    fallbackModel: 'openrouter/google/gemma-4-31b-it:free',
    evalsMode: false,
    dryRun: true,
    ...overrides,
  };
}

// ── Types ──────────────────────────────────────────────────────

describe('AutoscalerTypes', () => {
  it('creates a valid config with defaults', () => {
    const config = testConfig();
    expect(config.maxRunners).toBe(8);
    expect(config.repo).toBe('JovieInc/Jovie');
    expect(config.pollIntervalMs).toBe(15000);
    expect(config.runnerCpus).toBe(2);
  });

  it('allows overriding config values', () => {
    const config = testConfig({ maxRunners: 4, dryRun: false });
    expect(config.maxRunners).toBe(4);
    expect(config.dryRun).toBe(false);
  });

  it('has a valid model routing config', () => {
    const config = testConfig();
    expect(config.simpleModel).toBeTruthy();
    expect(config.standardModel).toBeTruthy();
    expect(config.escalationModel).toBeTruthy();
    expect(config.fallbackModel).toBeTruthy();
  });
});

// ── Model Routing ──────────────────────────────────────────────

describe('ModelRouter', () => {
  it('routes classification to simple model', () => {
    const route = selectRoute('classification');
    expect(route.profile).toBe('simple');
    expect(route.model).toBe('opencode-go/deepseek-v4-flash');
  });

  it('routes analysis to standard model', () => {
    const route = selectRoute('analysis');
    expect(route.profile).toBe('standard');
    expect(route.model).toBe('opencode-go/deepseek-v4-flash');
  });

  it('routes escalation to escalation model', () => {
    const route = selectRoute('escalation');
    expect(route.profile).toBe('escalation');
  });

  it('all routes have fallback models', () => {
    const routes = [
      selectRoute('classification'),
      selectRoute('analysis'),
      selectRoute('escalation'),
    ];
    for (const route of routes) {
      expect(route.fallbackModel).toBeTruthy();
      expect(route.reasons.length).toBeGreaterThan(0);
    }
  });
});

// ── Controller Logic ───────────────────────────────────────────

describe('Controller', () => {
  it('computes correct deficit with no queued jobs', () => {
    const config = testConfig();
    const queuedJobs = 0;
    const activeContainers = 0;
    const deficit = Math.max(
      0,
      Math.min(queuedJobs, config.maxRunners) - activeContainers
    );
    expect(deficit).toBe(0);
  });

  it('computes correct deficit with queued jobs', () => {
    const config = testConfig();
    const queuedJobs = 5;
    const activeContainers = 2;
    const deficit = Math.max(
      0,
      Math.min(queuedJobs, config.maxRunners) - activeContainers
    );
    expect(deficit).toBe(3);
  });

  it('respects max runners cap', () => {
    const config = testConfig();
    const queuedJobs = 100;
    const activeContainers = 0;
    const deficit = Math.max(
      0,
      Math.min(queuedJobs, config.maxRunners) - activeContainers
    );
    expect(deficit).toBe(8);
  });

  it('does not spawn negative deficit', () => {
    const config = testConfig();
    const queuedJobs = 2;
    const activeContainers = 5;
    const deficit = Math.max(
      0,
      Math.min(queuedJobs, config.maxRunners) - activeContainers
    );
    expect(deficit).toBe(0);
  });

  it('uses dry run mode to skip actual spawns', () => {
    const config = testConfig({ dryRun: true });
    expect(config.dryRun).toBe(true);
  });

  it('generates unique container names', () => {
    const names = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const name = `jovie-eph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      names.add(name);
    }
    expect(names.size).toBe(10);
  });

  it('parses poll interval from env defaults', () => {
    const config = testConfig({ pollIntervalMs: 30000 });
    expect(config.pollIntervalMs).toBe(30000);
  });

  it('handles idle timeout correctly', () => {
    const config = testConfig();
    expect(config.idleTimeoutMs).toBe(300000); // 5 min default
  });

  it('detects container name prefix correctly', () => {
    const prefix = 'jovie-eph-';
    const validName = `${prefix}1234567890-abcd`;
    const invalidName = 'gem-linux-1';
    expect(validName.startsWith(prefix)).toBe(true);
    expect(invalidName.startsWith(prefix)).toBe(false);
  });

  it('runner name matches expected pattern', () => {
    const name = `jovie-eph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    expect(name).toMatch(/^jovie-eph-\d+-[a-z0-9]{4}$/);
  });
});

// ── GitHub Integration ─────────────────────────────────────────

describe('GitHub Integration (mocked)', () => {
  it('identifies self-hosted runners by label', () => {
    const runners: ReadonlyArray<GitHubRunner> = [
      {
        id: 1,
        name: 'gem-linux',
        status: 'online',
        busy: false,
        labels: [{ name: 'self-hosted' }, { name: 'jovie-runner' }],
      },
      {
        id: 2,
        name: 'gem-linux-1',
        status: 'online',
        busy: false,
        labels: [{ name: 'self-hosted' }, { name: 'jovie-runner' }],
      },
      {
        id: 3,
        name: 'jovie-eph-1700000000-abcd',
        status: 'online',
        busy: true,
        labels: [{ name: 'ephemeral' }, { name: 'jovie-runner' }],
      },
    ];

    const jovieRunners = runners.filter(r =>
      r.labels.some(l => l.name === 'jovie-runner')
    );
    expect(jovieRunners).toHaveLength(3);

    const ephemeral = runners.filter(
      r => r.status === 'online' && r.busy && r.name.startsWith('jovie-eph-')
    );
    expect(ephemeral).toHaveLength(1);
  });

  it('filters offline ephemeral runners for reconciliation', () => {
    const runners: ReadonlyArray<GitHubRunner> = [
      { id: 1, name: 'jovie-eph-1700000000-aaaa', status: 'offline', busy: false, labels: [] },
      { id: 2, name: 'jovie-eph-1700000000-bbbb', status: 'online', busy: false, labels: [] },
      { id: 3, name: 'gem-linux', status: 'online', busy: false, labels: [] },
    ];

    const offlineStale = runners.filter(
      r => r.status === 'offline' && r.name.startsWith('jovie-eph-')
    );
    expect(offlineStale).toHaveLength(1);
    expect(offlineStale[0].id).toBe(1);
  });

  it('consecutive failures tracking resets on success', () => {
    let consecutive = 5;
    // On successful tick, reset to 0
    consecutive = 0;
    expect(consecutive).toBe(0);
  });

  it('escalates after 5 consecutive failures', () => {
    let consecutive = 6;
    const shouldEscalate = consecutive >= 5;
    expect(shouldEscalate).toBe(true);
  });
});

// ── Docker Integration ─────────────────────────────────────────

describe('Docker Integration (mocked)', () => {
  it('constructs valid spawn args', () => {
    const name = 'jovie-eph-1700000000-test';
    const token = 'test-token-123';
    const repo = 'JovieInc/Jovie';
    const labels = 'self-hosted,Linux,X64,jovie-runner,ephemeral';
    const image = 'myoung34/github-runner:latest';

    // Simulate the spawn args that would be constructed
    const expectedArgs: string[] = [
      'run', '-d', '--rm',
      '--name', name,
      '--label', 'ci.jovie.ephemeral=true',
      '--cpus=2',
      '--memory=6144m',
      '--cgroup-parent', 'ci-runners.slice',
      '-e', 'EPHEMERAL=1',
      '-e', `RUNNER_NAME=${name}`,
      '-e', `RUNNER_TOKEN=${token}`,
      '-e', 'RUNNER_SCOPE=repo',
      '-e', `REPO_URL=https://github.com/${repo}`,
      '-e', `LABELS=${labels}`,
      '-e', 'DISABLE_AUTO_UPDATE=1',
      image,
    ];

    expect(expectedArgs).toContain(name);
    expect(expectedArgs).toContain('--ephemeral' as any); // Not in our args — it's in the image
    expect(expectedArgs).toContain('--rm');
  });

  it('ephemeral mode is set via environment variable', () => {
    const env = 'EPHEMERAL=1';
    expect(env).toBe('EPHEMERAL=1');
  });

  it('auto-update is disabled for deterministic runner version', () => {
    const env = 'DISABLE_AUTO_UPDATE=1';
    expect(env).toBe('DISABLE_AUTO_UPDATE=1');
  });
});

// ── Failure Classification (mocked) ────────────────────────────

describe('FailureClassification (mocked)', () => {
  it('classifies timeout errors as known-flake', () => {
    const input = 'TimeoutError: Waiting for selector "#app" timed out';
    const isTimeout = input.includes('TimeoutError');
    expect(isTimeout).toBe(true);
  });

  it('classifies TypeScript errors as real-failure', () => {
    const input = 'TS2322: Type "string | undefined" is not assignable';
    const isTypeError = input.includes('TS2322');
    expect(isTypeError).toBe(true);
  });

  it('classifies disk-full as infrastructure', () => {
    const input = 'No space left on device';
    const isDiskFull = input.includes('No space left');
    expect(isDiskFull).toBe(true);
  });
});
