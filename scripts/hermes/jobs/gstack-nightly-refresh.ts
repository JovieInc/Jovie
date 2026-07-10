#!/usr/bin/env tsx
/**
 * gstack Nightly Refresh — Hermes/MBP
 *
 * Keeps agent runs reproducible: jobs only read their pinned local version;
 * this out-of-band job is the sole automatic upgrade path. A replacement is
 * staged beside the current install and restored from backup if setup fails.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendOpsAlert } from '../lib/ops-notify';

const JOB = 'gstack-nightly-refresh';
const GSTACK_REPOSITORY = 'https://github.com/garrytan/gstack.git';

export type RefreshResult =
  | { readonly status: 'up-to-date'; readonly version: string }
  | {
      readonly status: 'upgraded';
      readonly from: string;
      readonly to: string;
    };

function gstackDirectory(): string | null {
  const configured = process.env.GSTACK_UPGRADE_DIR?.trim();
  const candidates = [
    configured,
    join(homedir(), '.gstack', 'repos', 'gstack'),
    join(homedir(), '.claude', 'skills', 'gstack'),
  ].filter((path): path is string => Boolean(path));

  return candidates.find(path => existsSync(join(path, 'bin', 'gstack-config'))) ?? null;
}

function versionAt(dir: string): string {
  try {
    return readFileSync(join(dir, 'VERSION'), 'utf8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function command(dir: string, file: string, args: readonly string[]): string {
  return execFileSync(file, [...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

export function latestFromCheck(output: string): string | null {
  const match = output.match(/^UPGRADE_AVAILABLE\s+\S+\s+(\S+)$/m);
  return match?.[1] ?? null;
}

/** Upgrade the configured gstack install, retaining its pre-upgrade backup. */
export function refreshGstack(options?: {
  readonly dir?: string;
  readonly run?: typeof command;
}): RefreshResult {
  const dir = options?.dir ?? gstackDirectory();
  if (!dir) throw new Error('gstack install not found; set GSTACK_UPGRADE_DIR');
  const run = options?.run ?? command;
  const config = join(dir, 'bin', 'gstack-config');

  // Persist the policy before checking: agent jobs cannot opt back into an
  // inline upgrade between this refresh and their next preflight receipt.
  run(dir, config, ['set', 'auto_upgrade', 'false']);
  run(dir, config, ['set', 'upgrade_policy', 'pinned']);

  const current = versionAt(dir);
  const latest = latestFromCheck(
    run(dir, join(dir, 'bin', 'gstack-update-check'), ['--force'])
  );
  if (!latest || latest === current) return { status: 'up-to-date', version: current };

  const staging = mkdtempSync(join(tmpdir(), 'jovie-gstack-refresh-'));
  const replacement = join(staging, 'gstack');
  const backup = `${dir}.bak`;
  try {
    run(dir, 'git', ['clone', '--depth', '1', GSTACK_REPOSITORY, replacement]);
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
    renameSync(dir, backup);
    try {
      renameSync(replacement, dir);
      run(dir, join(dir, 'setup'), []);
    } catch (error) {
      rmSync(dir, { recursive: true, force: true });
      renameSync(backup, dir);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
    return { status: 'upgraded', from: current, to: versionAt(dir) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    try {
      const result = refreshGstack();
      logJobEvent({ job: JOB, event: result.status, ...result });
      process.stdout.write(`gstack refresh: ${JSON.stringify(result)}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logJobEvent({ job: JOB, event: 'failed', error: message });
      // SLACK_WEBHOOK_URL/HERMES_SLACK_WEBHOOK_URL is the existing #product
      // incoming webhook for Hermes alerts.
      await sendOpsAlert(`gstack nightly refresh failed\n\n${message}`);
      throw error;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(error => {
    console.error(`[${JOB}] fatal:`, error);
    process.exit(1);
  });
}
