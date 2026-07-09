/**
 * Docker client for the CI runner autoscaler.
 *
 * Uses `docker` CLI via child_process, matching the project's
 * execFileSync pattern for infrastructure operations.
 */

import { execFileSync } from 'node:child_process';
import { type EphemeralContainer } from './types';

export interface CgroupSliceConfig {
  readonly name: string;
  readonly cpuQuota: string; // e.g. "800%" for 8 cores
  readonly memoryMax: string; // e.g. "48G"
}

export class DockerClient {
  private readonly runnerImage: string;
  private readonly runnerLabels: string;
  private readonly cpus: number;
  private readonly memoryMb: number;
  private readonly cgroupParent: string;
  private readonly containerLabel = 'ci.jovie.ephemeral';

  constructor(config: {
    readonly runnerImage: string;
    readonly runnerLabels: string;
    readonly cpus: number;
    readonly memoryMb: number;
    readonly cgroupParent: string;
  }) {
    this.runnerImage = config.runnerImage;
    this.runnerLabels = config.runnerLabels;
    this.cpus = config.cpus;
    this.memoryMb = config.memoryMb;
    this.cgroupParent = config.cgroupParent;
  }

  /**
   * Spawn an ephemeral runner container.
   *
   * Uses `--ephemeral --once` so the runner self-deregisters after one job.
   * The container is `--rm` so it auto-cleans on exit.
   */
  spawnRunner(
    name: string,
    registrationToken: string,
    repo: string,
    labels: string
  ): string {
    const args: ReadonlyArray<string> = [
      'run',
      '-d',
      '--rm',
      '--name', name,
      '--label', `${this.containerLabel}=true`,
      `--cpus=${String(this.cpus)}`,
      `--memory=${String(this.memoryMb)}m`,
      '--cgroup-parent', this.cgroupParent,
      '-e', `EPHEMERAL=1`,
      '-e', `RUNNER_NAME=${name}`,
      '-e', `RUNNER_TOKEN=${registrationToken}`,
      '-e', 'RUNNER_SCOPE=repo',
      '-e', `REPO_URL=https://github.com/${repo}`,
      '-e', `LABELS=${labels}`,
      '-e', 'DISABLE_AUTO_UPDATE=1',
      this.runnerImage,
    ];

    try {
      const output = execFileSync('docker', args, {
        encoding: 'utf-8',
        timeout: 30_000,
        maxBuffer: 1024,
      });
      return output.trim();
    } catch (err) {
      throw new Error(
        `Docker spawn failed for ${name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * List currently running ephemeral containers.
   */
  listContainers(): ReadonlyArray<EphemeralContainer> {
    try {
      const output = execFileSync(
        'docker',
        [
          'ps',
          '--filter', `label=${this.containerLabel}=true`,
          '--format', '{{.ID}}\t{{.Names}}\t{{.CreatedAt}}',
          '--no-trunc',
        ],
        { encoding: 'utf-8', timeout: 10_000, maxBuffer: 10 * 1024 }
      );

      if (!output.trim()) return [];

      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [id, name, createdAtStr] = line.split('\t');
          return {
            id: id ?? '',
            name: name ?? '',
            createdAt: new Date(createdAtStr ?? Date.now()),
            runnerId: null,
            runnerName: name ?? '',
          };
        });
    } catch {
      return [];
    }
  }

  /**
   * Stop a runner container gracefully (SIGTERM → ephemeral deregisters).
   */
  stopContainer(containerId: string): void {
    try {
      execFileSync('docker', ['stop', '-t', '10', containerId], {
        encoding: 'utf-8',
        timeout: 15_000,
        maxBuffer: 1024,
      });
    } catch {
      // Best effort — container may already be gone
    }
  }

  /**
   * Count currently running ephemeral containers.
   */
  countContainers(): number {
    try {
      const output = execFileSync(
        'docker',
        [
          'ps',
          '-q',
          '--filter', `label=${this.containerLabel}=true`,
        ],
        { encoding: 'utf-8', timeout: 5_000, maxBuffer: 10 * 1024 }
      );
      return output.trim() ? output.trim().split('\n').length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get available Docker info (for diagnostics).
   */
  getInfo(): Record<string, unknown> {
    try {
      const output = execFileSync('docker', ['info', '--format', '{{json .}}'], {
        encoding: 'utf-8',
        timeout: 10_000,
        maxBuffer: 10 * 1024,
      });
      return JSON.parse(output) as Record<string, unknown>;
    } catch {
      return { error: 'Docker not available' };
    }
  }

  /**
   * Prune old Docker resources (called by systemd timer).
   */
  prune(): void {
    try {
      execFileSync('docker', ['system', 'prune', '-af', '--filter', 'until=48h'], {
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 1024,
      });
    } catch {
      // Best effort
    }
  }

  /**
   * Setup the cgroup slice that protects Ollama's resources.
   * This is idempotent — re-runs fine if the slice already exists.
   */
  static ensureCgroupSlice(config: CgroupSliceConfig): void {
    const sliceDir = `/sys/fs/cgroup/${config.name}.slice`;
    try {
      execFileSync('sudo', ['mkdir', '-p', sliceDir], {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      execFileSync(
        'sudo',
        ['sh', '-c', `echo "${config.cpuQuota}" > ${sliceDir}/cpu.max`],
        { encoding: 'utf-8', timeout: 10_000 }
      );
      execFileSync(
        'sudo',
        ['sh', '-c', `echo "${config.memoryMax}" > ${sliceDir}/memory.max`],
        { encoding: 'utf-8', timeout: 10_000 }
      );
    } catch {
      // Slice setup is best-effort on non-systemd hosts
    }
  }
}
