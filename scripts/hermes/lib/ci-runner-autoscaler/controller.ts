/**
 * Autoscaler controller — the core loop that polls GitHub, spawns Docker
 * containers, and reaps idle runners.
 *
 * Architecture (one tick):
 *   1. Count queued jobs targeting self-hosted runners (GitHub API)
 *   2. Count active ephemeral containers (Docker)
 *   3. Calculate deficit: spawn = min(queued, max − active)
 *   4. Fetch registration token, docker run for each deficit slot
 *   5. Reap idle runners (registered but no job after IDLE_TIMEOUT)
 *   6. Reconcile offline registrations
 */

import { appendFileSync } from 'node:fs';
import {
  type AutoscalerState,
  type EphemeralContainer,
  type GitHubRunner,
  type RunnerAutoscalerConfig,
} from './types';
import { DockerClient } from './docker';
import { GitHubClient } from './github';
import { classifyFailure, recommendScaling } from './router';

const SPAWN_NAME_PREFIX = 'jovie-eph-';

export class RunnerAutoscalerController {
  private readonly gh: GitHubClient;
  private readonly docker: DockerClient;
  private readonly config: RunnerAutoscalerConfig;
  private tickCount = 0;
  private consecutiveFailures = 0;

  constructor(config: RunnerAutoscalerConfig) {
    this.config = config;
    this.gh = new GitHubClient(config.repo);
    this.docker = new DockerClient({
      runnerImage: config.runnerImage,
      runnerLabels: config.runnerLabels,
      cpus: config.runnerCpus,
      memoryMb: config.runnerMemoryMb,
      cgroupParent: config.cgroupParent,
    });
  }

  /**
   * Run one autoscaler tick.
   */
  async tick(): Promise<AutoscalerState> {
    const timestamp = new Date();
    this.tickCount++;
    const tickNum = this.tickCount;

    const result: AutoscalerState = {
      queuedJobs: 0,
      activeRunners: 0,
      idleRunners: [],
      spawnedThisTick: 0,
      reapedThisTick: 0,
      reconciledThisTick: 0,
      timestamp,
    };

    this.log(`[Tick ${tickNum}] Starting poll cycle`);

    try {
      // 1. Count queued jobs
      const queuedJobs = this.gh.countQueuedJobs('jovie-runner');
      result.queuedJobs = queuedJobs;

      // 2. Count active containers
      const activeContainers = this.docker.countContainers();
      result.activeRunners = activeContainers;

      // 3. List registered runners from GitHub
      const registeredRunners = this.gh.listRunners();
      const activeRunners = registeredRunners.filter(
        r => r.status === 'online' && r.name.startsWith(SPAWN_NAME_PREFIX)
      );
      const onlineEphemeralCount = activeRunners.length;

      this.log(
        `Queued: ${queuedJobs}, Containers: ${activeContainers}, Online: ${onlineEphemeralCount}`
      );

      // 4. Calculate deficit
      const deficit = Math.max(
        0,
        Math.min(queuedJobs, this.config.maxRunners) - activeContainers
      );

      // Use AI for scaling recommendation if failures detected
      if (this.consecutiveFailures > 0) {
        try {
          const recommendation = await recommendScaling({
            queuedJobs,
            activeRunners: activeContainers,
            maxRunners: this.config.maxRunners,
            recentFailures: this.consecutiveFailures,
          });
          this.log(
            `AI scaling: ${recommendation.desiredRunners} runners (${recommendation.urgency} urgency): ${recommendation.reason}`
          );
        } catch {
          // AI scaling failed, use deterministic logic
        }
      }

      // 5. Spawn deficit
      if (deficit > 0 && !this.config.dryRun) {
        const token = this.gh.getRegistrationToken();
        for (let i = 0; i < deficit; i++) {
          const name = `${SPAWN_NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          try {
            this.docker.spawnRunner(
              name,
              token.token,
              this.config.repo,
              this.config.runnerLabels
            );
            result.spawnedThisTick++;
          } catch (err) {
            this.log(`Spawn failed for ${name}: ${err}`);
          }
          // Brief pause between spawns to avoid stampeding the API
          await sleep(500);
        }
      }

      // 6. Reap idle runners
      const idleToReap = this.findIdleRunners(
        registeredRunners,
        this.config.idleTimeoutMs
      );
      result.idleRunners = idleToReap;

      if (!this.config.dryRun) {
        for (const runner of idleToReap) {
          try {
            this.docker.stopContainer(runner.id);
            // Wait a moment then remove from GitHub
            await sleep(1000);
            this.gh.removeRunner(runner.runnerId!);
            result.reapedThisTick++;
          } catch {
            // Best effort
          }
        }
      }

      // 7. Reconcile offline ephemeral runners
      const offlineToRemove = registeredRunners.filter(
        r =>
          r.status === 'offline' &&
          r.name.startsWith(SPAWN_NAME_PREFIX) &&
          !r.busy
      );

      if (!this.config.dryRun) {
        for (const runner of offlineToRemove) {
          try {
            this.gh.removeRunner(runner.id);
            result.reconciledThisTick++;
          } catch {
            // Best effort
          }
        }
      }

      // Reset consecutive failures on successful tick
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      this.log(`Tick ${tickNum} failed: ${err instanceof Error ? err.message : String(err)}`);

      // After 5 consecutive failures, escalate
      if (this.consecutiveFailures >= 5) {
        this.log(`CRITICAL: ${this.consecutiveFailures} consecutive failures — need intervention`);
      }
    }

    this.log(
      `Tick ${tickNum} done: spawned=${result.spawnedThisTick} reaped=${result.reapedThisTick} reconciled=${result.reconciledThisTick}`
    );

    return result;
  }

  /**
   * Find runners that are registered but idle (no job assigned, beyond timeout).
   */
  private findIdleRunners(
    registeredRunners: ReadonlyArray<GitHubRunner>,
    idleTimeoutMs: number
  ): ReadonlyArray<EphemeralContainer> {
    const idleRunnerNames = registeredRunners
      .filter(
        r =>
          r.status === 'online' &&
          !r.busy &&
          r.name.startsWith(SPAWN_NAME_PREFIX)
      )
      .map(r => r.name);

    if (idleRunnerNames.length === 0) return [];

    // Cross-reference with Docker containers
    const containers = this.docker.listContainers();
    const now = Date.now();
    const idleThreshold = now - idleTimeoutMs;

    return containers.filter(
      c =>
        idleRunnerNames.includes(c.name) &&
        c.createdAt.getTime() < idleThreshold
    );
  }

  /**
   * Run the main loop continuously.
   */
  async runLoop(): Promise<void> {
    this.log(`Autoscaler started (max=${this.config.maxRunners}, poll=${this.config.pollIntervalMs}ms)`);
    this.log(`Runner image: ${this.config.runnerImage}`);
    this.log(`Labels: ${this.config.runnerLabels}`);
    this.log(`Cgroup: ${this.config.cgroupParent}`);

    // Setup cgroup slice
    DockerClient.ensureCgroupSlice({
      name: 'ci-runners',
      cpuQuota: '800%',
      memoryMax: '48G',
    });

    // Reconcile on startup — clean stale ephemeral runners
    if (!this.config.dryRun) {
      try {
        const runners = this.gh.listRunners();
        const offlineStale = runners.filter(
          r => r.status === 'offline' && r.name.startsWith(SPAWN_NAME_PREFIX)
        );
        for (const runner of offlineStale) {
          try {
            this.gh.removeRunner(runner.id);
            this.log(`Cleaned stale runner: ${runner.name} (id=${runner.id})`);
          } catch {
            // Best effort
          }
        }
      } catch {
        this.log('Startup reconciliation skipped');
      }
    }

    while (true) {
      await this.tick();
      await sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Log a message. In production this goes to stderr (captured by journald).
   * In evals mode it goes to stdout.
   */
  private log(message: string): void {
    const line = `[${new Date().toISOString()}] [autoscaler] ${message}\n`;
    process.stderr.write(line);

    // Also append to log file if configured
    const logPath = process.env.AUTOSCALER_LOG_PATH;
    if (logPath) {
      try {
        appendFileSync(logPath, line);
      } catch {
        // Best effort
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
