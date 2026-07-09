/**
 * Autoscaler controller — core loop for ephemeral CI runners (HUD module).
 *
 * Runs on gem-linux. Architecture per tick:
 *   1. Count queued jobs targeting self-hosted runners  (GitHub API)
 *   2. Count active ephemeral containers                (Docker)
 *   3. Calculate deficit → spawn new containers
 *   4. Reap idle runners (registered but no job after IDLE_TIMEOUT)
 *   5. Reconcile offline ephemeral registrations
 *
 * Reports state to a status endpoint so Ovie/HUD can display it.
 */

import { appendFileSync } from 'node:fs';
import type {
  AutoscalerConfig,
  AutoscalerState,
  EphemeralContainer,
  GitHubRunner,
} from './types';
import { DockerClient } from './docker';
import { GitHubClient } from './github';
import { recommendScaling } from './router';

const SPAWN_NAME_PREFIX = 'jovie-eph-';
const START_TIME = Date.now();

export class CiRunnerAutoscaler {
  private readonly gh: GitHubClient;
  private readonly docker: DockerClient;
  private readonly config: AutoscalerConfig;
  private tickCount = 0;
  private consecutiveFailures = 0;

  constructor(config: AutoscalerConfig) {
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

  /** Current autoscaler state snapshot. */
  getState(): AutoscalerState {
    return {
      queuedJobs: 0,
      activeContainers: this.docker.countContainers(),
      onlineEphemeralRunners: 0,
      spawnedThisTick: 0,
      reapedThisTick: 0,
      reconciledThisTick: 0,
      tickCount: this.tickCount,
      uptimeMs: Date.now(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Run one autoscaler tick. */
  async tick(): Promise<AutoscalerState> {
    this.tickCount++;
    const tickNum = this.tickCount;

    this.log(`[Tick ${tickNum}] Starting poll cycle`);

    const state: AutoscalerState = {
      queuedJobs: 0,
      activeContainers: 0,
      onlineEphemeralRunners: 0,
      spawnedThisTick: 0,
      reapedThisTick: 0,
      reconciledThisTick: 0,
      tickCount: tickNum,
      uptimeMs: Date.now() - START_TIME,
      timestamp: new Date().toISOString(),
    };

    try {
      // 1. Count queued jobs for our runners
      const queuedJobs = this.gh.countQueuedJobs('jovie-runner');
      state.queuedJobs = queuedJobs;

      // 2. Count active containers
      const activeContainers = this.docker.countContainers();
      state.activeContainers = activeContainers;

      // 3. List registered runners
      const registeredRunners = this.gh.listRunners();
      const onlineEphemeral = registeredRunners.filter(
        (r) => r.status === 'online' && r.name.startsWith(SPAWN_NAME_PREFIX),
      );
      state.onlineEphemeralRunners = onlineEphemeral.length;

      this.log(
        `Queued: ${queuedJobs}, Containers: ${activeContainers}, Ephemeral online: ${onlineEphemeral.length}`,
      );

      // 4. Calculate spawn deficit
      const deficit = Math.max(
        0,
        Math.min(queuedJobs, this.config.maxRunners) - activeContainers,
      );

      // AI scaling when failures detected
      if (this.consecutiveFailures > 0 && deficit > 0) {
        try {
          const rec = await recommendScaling({
            queuedJobs,
            activeRunners: activeContainers,
            maxRunners: this.config.maxRunners,
            recentFailures: this.consecutiveFailures,
          });
          this.log(
            `AI scaling: ${rec.desiredRunners} runners (${rec.urgency}): ${rec.reason}`,
          );
        } catch {
          // AI unavailable — use deterministic logic
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
              this.config.runnerLabels,
            );
            state.spawnedThisTick++;
          } catch (err) {
            this.log(`Spawn failed for ${name}: ${err}`);
          }
          // Spread spawns to avoid API stampede
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }
      }

      // 6. Reap idle runners
      const idleToReap = this.findIdleRunners(
        registeredRunners,
        this.config.idleTimeoutMs,
      );

      if (!this.config.dryRun) {
        for (const runner of idleToReap) {
          try {
            this.docker.stopContainer(runner.id);
            // eslint-disable-next-line no-await-in-loop
            await sleep(1000);
            this.gh.removeRunner(runner.runnerId!);
            state.reapedThisTick++;
          } catch {
            // Best effort
          }
        }
      }

      // 7. Reconcile offline ephemeral runners
      const offlineToRemove = registeredRunners.filter(
        (r) =>
          r.status === 'offline' &&
          r.name.startsWith(SPAWN_NAME_PREFIX) &&
          !r.busy,
      );

      if (!this.config.dryRun) {
        for (const runner of offlineToRemove) {
          try {
            this.gh.removeRunner(runner.id);
            state.reconciledThisTick++;
          } catch {
            // Best effort
          }
        }
      }

      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      this.log(
        `Tick ${tickNum} failed: ${err instanceof Error ? err.message : String(err)}`,
      );

      if (this.consecutiveFailures >= 5) {
        this.log(
          `CRITICAL: ${this.consecutiveFailures} consecutive failures — need intervention`,
        );
      }
    }

    this.log(
      `Tick ${tickNum} done: spawned=${state.spawnedThisTick} reaped=${state.reapedThisTick} reconciled=${state.reconciledThisTick}`,
    );

    return state;
  }

  /** Find registered idle ephemeral runners past the timeout. */
  private findIdleRunners(
    registeredRunners: ReadonlyArray<GitHubRunner>,
    idleTimeoutMs: number,
  ): ReadonlyArray<EphemeralContainer> {
    const idleRunnerNames = registeredRunners
      .filter(
        (r) => r.status === 'online' && !r.busy && r.name.startsWith(SPAWN_NAME_PREFIX),
      )
      .map((r) => r.name);

    if (idleRunnerNames.length === 0) return [];

    const containers = this.docker.listContainers();
    const idleThreshold = Date.now() - idleTimeoutMs;

    return containers.filter(
      (c) => idleRunnerNames.includes(c.name) && c.createdAt.getTime() < idleThreshold,
    );
  }

  /** Run the main loop continuously. */
  async runLoop(): Promise<void> {
    this.log(`Autoscaler started (max=${this.config.maxRunners}, poll=${this.config.pollIntervalMs}ms)`);

    // Setup cgroup slice
    DockerClient.ensureCgroupSlice({
      name: 'ci-runners',
      cpuQuota: '800%',
      memoryMax: '48G',
    });

    // Startup reconciliation
    if (!this.config.dryRun) {
      try {
        const runners = this.gh.listRunners();
        const offlineStale = runners.filter(
          (r) => r.status === 'offline' && r.name.startsWith(SPAWN_NAME_PREFIX),
        );
        for (const runner of offlineStale) {
          try {
            this.gh.removeRunner(runner.id);
            this.log(`Cleaned stale: ${runner.name} (id=${runner.id})`);
          } catch {
            // Best effort
          }
        }
      } catch {
        this.log('Startup reconciliation skipped (may not be gem-linux)');
      }
    }

    // Main loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.tick();
      await sleep(this.config.pollIntervalMs);
    }
  }

  /** Log a line (stderr → journald, plus optional log file). */
  private log(message: string): void {
    const line = `[${new Date().toISOString()}] [autoscaler] ${message}\n`;
    process.stderr.write(line);

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
  return new Promise((resolve) => setTimeout(resolve, ms));
}
