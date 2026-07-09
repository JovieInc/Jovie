#!/usr/bin/env tsx
/**
 * CI Runner Autoscaler — ephemeral Docker-based GitHub Actions runners on
 * gem-linux.
 *
 * A long-running daemon that:
 *   - Polls the GitHub API for queued jobs targeting self-hosted runners
 *   - Spawns ephemeral Docker containers to meet demand (cap: 8)
 *   - Reaps idle runners after a configurable timeout
 *   - Uses Vercel AI SDK model routing for CI failure analysis
 *
 * Evals are embedded — use the `--evals` flag to run integration tests.
 *
 * Usage:
 *   # Daemon mode (production)
 *   tsx scripts/hermes/jobs/ci-runner-autoscaler.ts
 *
 *   # Evals mode (mocked infrastructure)
 *   AUTOSCALER_EVALS=1 tsx scripts/hermes/jobs/ci-runner-autoscaler.ts --evals
 *
 *   # Dry-run mode (log only, no actual spawns)
 *   AUTOSCALER_DRY_RUN=1 tsx scripts/hermes/jobs/ci-runner-autoscaler.ts
 *
 * Runs on: gem-linux (Ubuntu 24.04, Tailscale 100.105.87.117)
 */

import { RunnerAutoscalerController } from '../lib/ci-runner-autoscaler/controller';
import { type RunnerAutoscalerConfig } from '../lib/ci-runner-autoscaler/types';
import { runAllEvals } from '../lib/ci-runner-autoscaler/evals';

// ── Config ─────────────────────────────────────────────────────

function loadConfig(): RunnerAutoscalerConfig {
  const repoOwner = process.env.AUTOSCALER_REPO_OWNER ?? 'JovieInc';
  const repoName = process.env.AUTOSCALER_REPO_NAME ?? 'Jovie';
  const repo = `${repoOwner}/${repoName}`;

  return {
    repo,
    repoOwner,
    repoName,

    // Runner pool
    maxRunners: parseInt(process.env.AUTOSCALER_MAX_RUNNERS ?? '8', 10),
    pollIntervalMs: parseInt(
      process.env.AUTOSCALER_POLL_INTERVAL_MS ?? '15000',
      10
    ),
    idleTimeoutMs: parseInt(
      process.env.AUTOSCALER_IDLE_TIMEOUT_MS ?? '300000',
      10
    ),

    // Container resources
    runnerCpus: parseInt(process.env.AUTOSCALER_RUNNER_CPUS ?? '2', 10),
    runnerMemoryMb: parseInt(
      process.env.AUTOSCALER_RUNNER_MEMORY_MB ?? '6144',
      10
    ),
    runnerImage:
      process.env.AUTOSCALER_RUNNER_IMAGE ??
      'myoung34/github-runner:latest',
    runnerLabels:
      process.env.AUTOSCALER_RUNNER_LABELS ??
      'self-hosted,Linux,X64,jovie-runner,ephemeral',
    runnerWorkDir: process.env.AUTOSCALER_RUNNER_WORK_DIR ?? '/tmp/runner-work',
    cgroupParent:
      process.env.AUTOSCALER_CGROUP_PARENT ?? 'ci-runners.slice',

    // Docker
    dockerSocket: process.env.AUTOSCALER_DOCKER_SOCKET ?? '/var/run/docker.sock',

    // gbrain
    gbraintoken: process.env.AUTOSCALER_GBRAIN_TOKEN ?? '',
    gbrainUrl:
      process.env.AUTOSCALER_GBRAIN_URL ?? 'http://100.115.191.120:7801/mcp',

    // Model routing (matching fleet model tiers)
    simpleModel: process.env.AUTOSCALER_SIMPLE_MODEL ?? 'opencode-go/deepseek-v4-flash',
    standardModel: process.env.AUTOSCALER_STANDARD_MODEL ?? 'opencode-go/deepseek-v4-flash',
    escalationModel: process.env.AUTOSCALER_ESCALATION_MODEL ?? 'ollama/qwen3-coder:30b',
    fallbackModel: process.env.AUTOSCALER_FALLBACK_MODEL ?? 'openrouter/google/gemma-4-31b-it:free',

    // Modes
    evalsMode: process.env.AUTOSCALER_EVALS === '1',
    dryRun: process.env.AUTOSCALER_DRY_RUN === '1',
  };
}

// ── Entrypoint ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runEvals = args.includes('--evals');

  if (runEvals) {
    console.log('🏃 Running CI Runner Autoscaler Evals (E1–E9)');
    console.log('');
    const results = await runAllEvals();
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    console.log('');
    console.log(
      failed > 0
        ? `❌ ${failed} eval(s) failed — fix before deploying`
        : `✅ All ${passed} evals passed`
    );
    process.exit(failed > 0 ? 1 : 0);
  }

  const config = loadConfig();
  const controller = new RunnerAutoscalerController(config);

  console.log(`🚀 CI Runner Autoscaler starting`);
  console.log(`   Repo: ${config.repo}`);
  console.log(`   Max runners: ${config.maxRunners}`);
  console.log(`   Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`   Runner image: ${config.runnerImage}`);
  console.log(`   Labels: ${config.runnerLabels}`);
  console.log(`   Dry run: ${config.dryRun}`);
  console.log(`   Model routes: simple=${config.simpleModel} standard=${config.standardModel} escalation=${config.escalationModel}`);
  console.log('');

  // Signal ready for systemd
  if (process.send) {
    process.send('ready');
  }

  // Trap graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    // Don't exit — let the daemon restart via systemd Restart=always
  });

  try {
    await controller.runLoop();
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
