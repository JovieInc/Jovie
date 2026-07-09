#!/usr/bin/env tsx
/**
 * CI Runner Autoscaler — gem-linux daemon.
 *
 * Standalone entrypoint that runs on gem-linux. Imports the core library
 * from lib/hud/ci-runners/ using relative paths.
 *
 * This file gets deployed to /opt/ci-runner-autoscaler/index.ts on gem-linux
 * along with the lib/ directory. It pairs with the Ovie API route at:
 *   apps/web/app/api/admin/hud/ci-runners/route.ts
 *
 * Usage:
 *   # Daemon mode (production, systemd-managed)
 *   tsx scripts/ci-runner-autoscaler.ts
 *
 *   # Evals mode (mocked infrastructure, no side effects)
 *   AUTOSCALER_EVALS=1 tsx scripts/ci-runner-autoscaler.ts --evals
 *
 *   # Dry-run mode (log only)
 *   AUTOSCALER_DRY_RUN=1 tsx scripts/ci-runner-autoscaler.ts
 *
 * Runs on: gem-linux (Tailscale 100.105.87.117, OpenClaw port 18791)
 */

import { CiRunnerAutoscaler } from '../lib/hud/ci-runners/controller';
import type { AutoscalerConfig } from '../lib/hud/ci-runners/types';
import { runAllEvals } from '../lib/hud/ci-runners/evals';

// ── Config ─────────────────────────────────────────────────────

function loadConfig(): AutoscalerConfig {
  const repoOwner = process.env.AUTOSCALER_REPO_OWNER ?? 'JovieInc';
  const repoName = process.env.AUTOSCALER_REPO_NAME ?? 'Jovie';
  const repo = `${repoOwner}/${repoName}`;

  return {
    repo,
    repoOwner,
    repoName,
    maxRunners: parseInt(process.env.AUTOSCALER_MAX_RUNNERS ?? '8', 10),
    pollIntervalMs: parseInt(
      process.env.AUTOSCALER_POLL_INTERVAL_MS ?? '15000',
      10,
    ),
    idleTimeoutMs: parseInt(
      process.env.AUTOSCALER_IDLE_TIMEOUT_MS ?? '300000',
      10,
    ),
    runnerCpus: parseInt(process.env.AUTOSCALER_RUNNER_CPUS ?? '2', 10),
    runnerMemoryMb: parseInt(
      process.env.AUTOSCALER_RUNNER_MEMORY_MB ?? '6144',
      10,
    ),
    runnerImage:
      process.env.AUTOSCALER_RUNNER_IMAGE ?? 'jovie-runner:latest',
    runnerLabels:
      process.env.AUTOSCALER_RUNNER_LABELS ??
      'self-hosted,Linux,X64,jovie-runner,ephemeral',
    runnerWorkDir: process.env.AUTOSCALER_RUNNER_WORK_DIR ?? '/tmp/runner-work',
    cgroupParent:
      process.env.AUTOSCALER_CGROUP_PARENT ?? 'ci-runners.slice',
    dockerSocket:
      process.env.AUTOSCALER_DOCKER_SOCKET ?? '/var/run/docker.sock',
    simpleModel:
      process.env.AUTOSCALER_SIMPLE_MODEL ?? 'opencode-go/deepseek-v4-flash',
    standardModel:
      process.env.AUTOSCALER_STANDARD_MODEL ?? 'opencode-go/deepseek-v4-flash',
    escalationModel:
      process.env.AUTOSCALER_ESCALATION_MODEL ?? 'ollama/qwen3-coder:30b',
    fallbackModel:
      process.env.AUTOSCALER_FALLBACK_MODEL ??
      'openrouter/google/gemma-4-31b-it:free',
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
    const results = await runAllEvals();
    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    console.log(
      failed > 0
        ? `\n❌ ${failed} eval(s) failed — fix before deploying`
        : `\n✅ All ${passed} evals passed`,
    );
    process.exit(failed > 0 ? 1 : 0);
  }

  const config = loadConfig();
  const controller = new CiRunnerAutoscaler(config);

  console.log('🚀 CI Runner Autoscaler starting');
  console.log(`   Repo: ${config.repo}`);
  console.log(`   Max runners: ${config.maxRunners}`);
  console.log(`   Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`   Runner image: ${config.runnerImage}`);
  console.log(`   Labels: ${config.runnerLabels}`);
  console.log(`   Dry run: ${config.dryRun}`);
  console.log(
    `   Model routes: simple=${config.simpleModel} standard=${config.standardModel} escalation=${config.escalationModel}`,
  );

  // Signal ready for systemd
  if (process.send) {
    process.send('ready');
  }

  // Graceful shutdown
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
    // Don't exit — Restart=always handles recovery
  });

  await controller.runLoop();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
