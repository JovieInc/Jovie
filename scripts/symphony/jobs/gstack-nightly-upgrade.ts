#!/usr/bin/env tsx
/**
 * gstack Nightly Upgrade — Hermes lane (JOV-4184 / GH-13915)
 *
 * Agent jobs consume a PINNED gstack version; upgrades happen HERE, out-of-band,
 * never mid-run. Nightly flow:
 *
 *   1. Detect the machine-global git install (~/.claude/skills/gstack or
 *      ~/.gstack/repos/gstack). Vendored in-repo copies are code changes and
 *      stay on the PR path — this job never rewrites repo files.
 *   2. Enforce the pinned policy in ~/.gstack/config.yaml
 *      (upgrade_policy=pinned, auto_upgrade=false) so no skill preamble
 *      upgrades in-run.
 *   3. Compare local VERSION to the remote VERSION (10s cap). Up to date → exit.
 *   4. Upgrade with backup/restore: snapshot HEAD, `git fetch` +
 *      `reset --hard origin/main` + `./setup`; on failure reset back to the
 *      snapshot, re-run `./setup`, and alert ops (#product webhook + Telegram)
 *      instead of blocking jobs.
 *   5. Write the just-upgraded marker + refresh the update-check cache so the
 *      next preflight receipt reports the new pinned version.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendOpsAlert } from '../lib/ops-notify';

const JOB = 'gstack-nightly-upgrade';
const REMOTE_VERSION_URL =
  process.env.GSTACK_REMOTE_URL ??
  'https://raw.githubusercontent.com/garrytan/gstack/main/VERSION';
const STATE_DIR = process.env.GSTACK_STATE_DIR ?? join(homedir(), '.gstack');

function sh(cwd: string, cmd: string, args: readonly string[]): string {
  return execFileSync(cmd, [...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

function detectGitInstall(): string | null {
  const candidates = [
    join(homedir(), '.claude/skills/gstack'),
    join(homedir(), '.gstack/repos/gstack'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, '.git'))) return dir;
  }
  return null;
}

function readVersion(installDir: string): string {
  try {
    return readFileSync(join(installDir, 'VERSION'), 'utf8').trim();
  } catch {
    return '';
  }
}

/** Pin the policy so skill preambles never upgrade mid-run. Best-effort. */
function enforcePinnedPolicy(installDir: string): void {
  const config = join(installDir, 'bin', 'gstack-config');
  if (!existsSync(config)) return;
  for (const [key, value] of [
    ['upgrade_policy', 'pinned'],
    ['auto_upgrade', 'false'],
  ] as const) {
    try {
      execFileSync(config, ['set', key, value], {
        encoding: 'utf8',
        timeout: 10_000,
      });
    } catch {
      // best-effort — a missing/failed config write never blocks the upgrade
    }
  }
}

async function fetchRemoteVersion(): Promise<string> {
  try {
    const res = await fetch(REMOTE_VERSION_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return '';
    const text = (await res.text()).trim();
    return /^[0-9]+\.[0-9.]+$/.test(text) ? text : '';
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const installDir = detectGitInstall();
    if (!installDir) {
      logJobEvent({ job: JOB, event: 'skip', reason: 'no_git_install' });
      return;
    }

    enforcePinnedPolicy(installDir);

    const local = readVersion(installDir);
    const remote = await fetchRemoteVersion();
    if (!remote) {
      logJobEvent({ job: JOB, event: 'skip', reason: 'remote_unreachable' });
      return;
    }
    if (!local || local === remote) {
      logJobEvent({ job: JOB, event: 'up_to_date', version: local || remote });
      return;
    }

    const backupSha = sh(installDir, 'git', ['rev-parse', 'HEAD']).trim();
    logJobEvent({ job: JOB, event: 'upgrading', from: local, to: remote });

    try {
      sh(installDir, 'git', ['fetch', 'origin']);
      sh(installDir, 'git', ['reset', '--hard', 'origin/main']);
      sh(installDir, './setup', []);

      const upgraded = readVersion(installDir);
      mkdirSync(STATE_DIR, { recursive: true });
      // Same marker/cache contract as /gstack-upgrade: next update-check
      // reports JUST_UPGRADED and the stale UPGRADE_AVAILABLE cache clears.
      writeFileSync(join(STATE_DIR, 'just-upgraded-from'), `${local}\n`);
      writeFileSync(
        join(STATE_DIR, 'last-update-check'),
        `UP_TO_DATE ${upgraded}\n`
      );
      logJobEvent({ job: JOB, event: 'upgraded', from: local, to: upgraded });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logJobEvent({ job: JOB, event: 'upgrade_failed', error: message });
      try {
        sh(installDir, 'git', ['reset', '--hard', backupSha]);
        sh(installDir, './setup', []);
        logJobEvent({ job: JOB, event: 'restored', sha: backupSha });
      } catch (restoreErr) {
        logJobEvent({
          job: JOB,
          event: 'restore_failed',
          error:
            restoreErr instanceof Error
              ? restoreErr.message
              : String(restoreErr),
        });
      }
      await sendOpsAlert(
        `gstack nightly upgrade FAILED (${local} → ${remote}) at ${installDir}. ` +
          `Restored previous version; agent jobs keep running pinned to ${local}. ` +
          `Error: ${message.slice(0, 500)}`
      );
    }
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0);
});
