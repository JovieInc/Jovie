/**
 * Docker client for the CI runner autoscaler (HUD module).
 *
 * Uses `docker` CLI via child_process. Runs on gem-linux only.
 * Each ephemeral runner gets one job via --ephemeral --once, then
 * self-deregisters and the --rm flag cleans up the container.
 */

import { execFileSync } from 'node:child_process';
import type { EphemeralContainer } from './types';

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

  /** Spawn an ephemeral runner container. */
  spawnRunner(
    name: string,
    registrationToken: string,
    repo: string,
    labels: string,
  ): string {
    const args: ReadonlyArray<string> = [
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '--label',
      `${this.containerLabel}=true`,
      `--cpus=${String(this.cpus)}`,
      `--memory=${String(this.memoryMb)}m`,
      '--cgroup-parent',
      this.cgroupParent,
      '-e',
      'EPHEMERAL=1',
      '-e',
      `RUNNER_NAME=${name}`,
      '-e',
      `RUNNER_TOKEN=${registrationToken}`,
      '-e',
      'RUNNER_SCOPE=repo',
      '-e',
      `REPO_URL=https://github.com/${repo}`,
      '-e',
      `LABELS=${labels}`,
      '-e',
      'DISABLE_AUTO_UPDATE=1',
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
        `Docker spawn failed for ${name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** List running ephemeral containers. */
  listContainers(): ReadonlyArray<EphemeralContainer> {
    try {
      const output = execFileSync(
        'docker',
        [
          'ps',
          '--filter',
          `label=${this.containerLabel}=true`,
          '--format',
          '{{.ID}}\t{{.Names}}\t{{.CreatedAt}}',
          '--no-trunc',
        ],
        { encoding: 'utf-8', timeout: 10_000, maxBuffer: 10 * 1024 },
      );

      if (!output.trim()) return [];

      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
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

  /** Stop a container gracefully (SIGTERM → ephemeral deregisters). */
  stopContainer(containerId: string): void {
    try {
      execFileSync('docker', ['stop', '-t', '10', containerId], {
        encoding: 'utf-8',
        timeout: 15_000,
        maxBuffer: 1024,
      });
    } catch {
      // Best effort
    }
  }

  /** Count running ephemeral containers. */
  countContainers(): number {
    try {
      const output = execFileSync(
        'docker',
        ['ps', '-q', '--filter', `label=${this.containerLabel}=true`],
        { encoding: 'utf-8', timeout: 5_000, maxBuffer: 10 * 1024 },
      );
      return output.trim() ? output.trim().split('\n').length : 0;
    } catch {
      return 0;
    }
  }

  /** Get Docker info for diagnostics. */
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

  /** Prune old Docker resources (called by systemd timer). */
  prune(): void {
    try {
      execFileSync(
        'docker',
        ['system', 'prune', '-af', '--filter', 'until=48h'],
        { encoding: 'utf-8', timeout: 60_000, maxBuffer: 1024 },
      );
    } catch {
      // Best effort
    }
  }

  /**
   * Setup cgroup slice to protect Ollama resources.
   * Idempotent — safe to rerun.
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
        { encoding: 'utf-8', timeout: 10_000 },
      );
      execFileSync(
        'sudo',
        ['sh', '-c', `echo "${config.memoryMax}" > ${sliceDir}/memory.max`],
        { encoding: 'utf-8', timeout: 10_000 },
      );
    } catch {
      // Best effort — slice may be managed by systemd
    }
  }
}
