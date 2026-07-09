/**
 * gbrain client for the CI runner autoscaler (HUD module).
 *
 * Records shipping-relevant events to gbrain (shared Supabase brain).
 * Any agent that ships code to production must log to gbrain so the fleet
 * has traceability on deploy infrastructure changes.
 *
 * Uses `execFileSync` to call the gbrain CLI, matching the pattern in
 * github.ts and docker.ts. On gem-linux the CLI lives at ~/.local/bin/gbrain.
 *
 * Recorded event types:
 *   - runner-spawn: A new ephemeral runner was created
 *   - runner-reap: An idle runner was removed
 *   - runner-reconcile: A stale offline registration was cleaned
 *   - scaling-decision: AI or deterministic scaling recommendation applied
 *   - failure-classification: AI classified a CI failure
 *   - state-snapshot: Periodic state snapshot (every N ticks)
 */

import { execFileSync } from 'node:child_process';
import type { AutoscalerState } from './types';

const GBRAIN_CLI = process.env.GBRAIN_CLI_PATH ?? '/home/timwhite/.local/bin/gbrain';
const PAGE_PREFIX = 'ops/ci-runners/';

interface GbrainEvent {
  readonly type: string;
  readonly timestamp: string;
  readonly tick: number;
  readonly payload: Record<string, unknown>;
}

export class GbrainClient {
  private readonly repo: string;
  private readonly enabled: boolean;
  private lastStateSnapshotTick = 0;

  constructor(repo: string) {
    this.repo = repo;
    // Only enable on gem-linux where the CLI is installed
    this.enabled = process.env.AUTOSCALER_DISABLE_GBRAIN !== '1';
  }

  /** Log a runner spawn event. */
  recordSpawn(name: string): void {
    if (!this.enabled) return;
    this.putEvent('runner-spawn', {
      runnerName: name,
      repo: this.repo,
    });
  }

  /** Log a runner reap event. */
  recordReap(name: string, reason: string): void {
    if (!this.enabled) return;
    this.putEvent('runner-reap', {
      runnerName: name,
      reason,
      repo: this.repo,
    });
  }

  /** Log a stale registration cleanup. */
  recordReconcile(name: string, runnerId: number): void {
    if (!this.enabled) return;
    this.putEvent('runner-reconcile', {
      runnerName: name,
      runnerId,
      repo: this.repo,
    });
  }

  /** Log an AI scaling decision. */
  recordScalingDecision(
    desired: number,
    reason: string,
    urgency: string,
    context: Record<string, unknown>,
  ): void {
    if (!this.enabled) return;
    this.putEvent('scaling-decision', {
      desiredRunners: desired,
      reason,
      urgency,
      ...context,
      repo: this.repo,
    });
  }

  /** Log a failure classification from the AI router. */
  recordFailureClassification(
    runId: number,
    failureClass: string,
    confidence: number,
    recommendation: string,
  ): void {
    if (!this.enabled) return;
    this.putEvent('failure-classification', {
      runId,
      failureClass,
      confidence,
      recommendation,
      repo: this.repo,
    });
  }

  /** Log a state snapshot (periodic). */
  recordStateSnapshot(state: AutoscalerState): void {
    if (!this.enabled) return;
    // Only snapshot every 20 ticks to avoid noise
    if (state.tickCount - this.lastStateSnapshotTick < 20) return;
    this.lastStateSnapshotTick = state.tickCount;

    this.putEvent('state-snapshot', {
      queuedJobs: state.queuedJobs,
      activeContainers: state.activeContainers,
      onlineEphemeralRunners: state.onlineEphemeralRunners,
      spawnedThisTick: state.spawnedThisTick,
      reapedThisTick: state.reapedThisTick,
      reconciledThisTick: state.reconciledThisTick,
      tickCount: state.tickCount,
      uptimeMs: state.uptimeMs,
      repo: this.repo,
    });
  }

  /** Write an event to gbrain at ops/ci-runners/<type>/<timestamp>. */
  private putEvent(
    type: string,
    fields: Record<string, unknown>,
  ): void {
    const slug = `${PAGE_PREFIX}${type}/${Date.now()}`;
    const event: GbrainEvent = {
      type,
      timestamp: new Date().toISOString(),
      tick: 0,
      payload: fields,
    };

    try {
      const content = JSON.stringify(event, null, 2);
      execFileSync(GBRAIN_CLI, ['put', slug], {
        input: content,
        encoding: 'utf-8',
        timeout: 10_000,
        maxBuffer: 1024,
        env: { ...process.env, PATH: '/home/timwhite/.local/bin:/usr/local/bin:/usr/bin:/bin' },
      });
    } catch {
      // gbrain is best-effort — don't let failures crash the autoscaler
    }
  }
}
