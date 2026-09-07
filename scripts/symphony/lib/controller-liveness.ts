/**
 * Controller liveness receipt for Mac (Ovie Mac shipper) and Gem (fleet HUD)
 * checkins.
 *
 * JOV-6004 slice 1: read-only classification. Emits a typed receipt that
 * authorizes the independent control-plane recovery lane when a required
 * controller is dark. No Linear, PR, merge-queue, or deploy mutations here.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONTROLLER_LIVENESS_SCHEMA = 'jovie-controller-liveness/v1';
export const CONTROLLER_LIVENESS_STALE_MS = 5 * 60 * 1000;

export const MAC_SHIP_OWNER_LOCK = join(
  homedir(),
  '.hermes',
  'state',
  'ship-owner.lock'
);

export const GEM_SHIP_HUD_ATTESTATION = join(
  homedir(),
  '.local',
  'state',
  'gem-checkin-hud',
  'gem-ship-hud-attestation.json'
);

export type ControllerKind = 'mac' | 'gem';

export type ControllerHealthStatus = 'healthy' | 'missing' | 'stale' | 'dead';

export interface ControllerCheckin {
  readonly kind: ControllerKind;
  readonly observedAt: string;
  readonly pid: number | null;
  readonly evidence: string;
}

export interface ControllerViolation {
  readonly kind: ControllerKind;
  readonly status: ControllerHealthStatus;
  readonly reason: string;
  readonly ageMs: number;
  readonly owner: string;
  readonly nextAction: string;
}

export interface ControllerLivenessRecoveryLane {
  readonly authorized: boolean;
  readonly reason: string;
}

export interface ControllerLivenessReceipt {
  readonly schema: typeof CONTROLLER_LIVENESS_SCHEMA;
  readonly observedAt: string;
  readonly staleAfterMs: number;
  readonly status: 'healthy' | 'dark';
  readonly controllers: ReadonlyArray<ControllerCheckin>;
  readonly violations: ReadonlyArray<ControllerViolation>;
  readonly recoveryLane: ControllerLivenessRecoveryLane;
}

interface MacShipOwnerLock {
  readonly caller?: string;
  readonly pid?: number;
  readonly ts?: number;
}

interface GemShipHudAttestation {
  readonly schema?: string;
  readonly observedAt?: string;
  readonly pid?: number | null;
  readonly service?: string;
  readonly activeState?: string;
  readonly subState?: string;
}

export function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readMacCheckin(
  lockPath: string = MAC_SHIP_OWNER_LOCK
): ControllerCheckin | null {
  const data = readJsonFile<MacShipOwnerLock>(lockPath);
  if (!data || typeof data.ts !== 'number') return null;
  const observedAt = new Date(data.ts).toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) return null;
  const pid = typeof data.pid === 'number' ? data.pid : null;
  return {
    kind: 'mac',
    observedAt,
    pid,
    evidence: `ship-owner.lock:${lockPath}`,
  };
}

export function readGemCheckin(
  attestationPath: string = GEM_SHIP_HUD_ATTESTATION
): ControllerCheckin | null {
  const data = readJsonFile<GemShipHudAttestation>(attestationPath);
  if (!data || data.schema !== 'gem-ship-hud-activation/v1') return null;
  const observedAt = data.observedAt;
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) return null;
  const pid = typeof data.pid === 'number' ? data.pid : null;
  return {
    kind: 'gem',
    observedAt,
    pid,
    evidence: `gem-ship-hud-attestation:${attestationPath}`,
  };
}

export interface ControllerCheckins {
  readonly mac: ControllerCheckin | null;
  readonly gem: ControllerCheckin | null;
}

export function readControllerCheckins(
  paths: { readonly mac?: string; readonly gem?: string } = {}
): ControllerCheckins {
  return {
    mac: readMacCheckin(paths.mac),
    gem: readGemCheckin(paths.gem),
  };
}

export interface EvaluateControllerOptions {
  readonly now?: Date;
  readonly staleAfterMs?: number;
  readonly isAlive?: (pid: number) => boolean;
}

export function evaluateController(
  kind: ControllerKind,
  checkin: ControllerCheckin | null,
  options: EvaluateControllerOptions = {}
): ControllerViolation | null {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? CONTROLLER_LIVENESS_STALE_MS;
  const isAlive = options.isAlive ?? defaultIsAlive;
  const owner = kind === 'mac' ? 'mac-shipper' : 'gem';
  const nextAction =
    kind === 'mac'
      ? 'reconcile-mac-ship-owner-lock'
      : 'reconcile-gem-ship-hud-service';

  if (!checkin) {
    return {
      kind,
      status: 'missing',
      reason: 'no checkin receipt or lock',
      ageMs: Number.POSITIVE_INFINITY,
      owner,
      nextAction,
    };
  }

  const observedMs = Date.parse(checkin.observedAt);
  const ageMs = now.getTime() - observedMs;

  if (ageMs < -30_000) {
    return {
      kind,
      status: 'stale',
      reason: 'checkin timestamp is in the future',
      ageMs: Number.POSITIVE_INFINITY,
      owner,
      nextAction,
    };
  }

  if (ageMs >= staleAfterMs) {
    return {
      kind,
      status: 'stale',
      reason: `checkin older than ${staleAfterMs}ms`,
      ageMs,
      owner,
      nextAction,
    };
  }

  if (checkin.pid !== null && !isAlive(checkin.pid)) {
    return {
      kind,
      status: 'dead',
      reason: 'recorded process is dead',
      ageMs,
      owner,
      nextAction,
    };
  }

  return null;
}

export interface BuildReceiptOptions {
  readonly now?: Date;
  readonly staleAfterMs?: number;
  readonly isAlive?: (pid: number) => boolean;
}

export function buildControllerLivenessReceipt(
  checkins: ControllerCheckins,
  options: BuildReceiptOptions = {}
): ControllerLivenessReceipt {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? CONTROLLER_LIVENESS_STALE_MS;
  const isAlive = options.isAlive ?? defaultIsAlive;

  const controllers: ControllerCheckin[] = [];
  if (checkins.mac) controllers.push(checkins.mac);
  if (checkins.gem) controllers.push(checkins.gem);

  const violations = [
    evaluateController('mac', checkins.mac, {
      now,
      staleAfterMs,
      isAlive,
    }),
    evaluateController('gem', checkins.gem, {
      now,
      staleAfterMs,
      isAlive,
    }),
  ].filter((v): v is ControllerViolation => v !== null);

  const status = violations.length === 0 ? 'healthy' : 'dark';
  const recoveryLane: ControllerLivenessRecoveryLane =
    status === 'dark'
      ? {
          authorized: true,
          reason: `controller-dark:${violations.map(v => v.kind).join(',')}`,
        }
      : { authorized: false, reason: 'all controllers healthy' };

  return {
    schema: CONTROLLER_LIVENESS_SCHEMA,
    observedAt: now.toISOString(),
    staleAfterMs,
    status,
    controllers,
    violations,
    recoveryLane,
  };
}
