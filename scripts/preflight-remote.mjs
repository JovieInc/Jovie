#!/usr/bin/env node
/**
 * Run `pnpm preflight:changed` on the Gem box instead of this machine.
 *
 *   pnpm preflight:remote [--host gem] [--no-push] [--dry-run] [preflight:changed args...]
 *
 * Laptops only host orchestration and sessions; vitest/tsc execute on Gem. The script:
 *  1. pushes the current branch (or with --no-push requires origin/<branch> == HEAD),
 *  2. creates/reuses a worktree ~/wt/remote-preflight/<slug> on the host from a private
 *     clone (never touches ~/Jovie), installs with a shared pnpm store, using the repo's
 *     .nvmrc through the host's user-level nvm,
 *  3. waits for one of N host-wide slots (JOVIE_REMOTE_PREFLIGHT_SLOTS, default 4),
 *  4. runs `pnpm preflight:changed` there with the same args (--body-file is shipped inline),
 *  5. streams output back and exits with the same status.
 * Only the pushed commit is checked; uncommitted local edits are warned about, not sent.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_HOST = 'gem';
// ponytail: 2 slots — Gem hit load 63/16 cores with 4 (2026-10-29); raise when lanes move off Gem.
export const DEFAULT_SLOTS = 2;

/** Filesystem-safe worktree name for a branch. */
export function branchSlug(branch) {
  return branch.replace(/[^A-Za-z0-9._-]+/g, '__').replace(/^\.+/, '_');
}

/** Split our flags from the ones forwarded verbatim to preflight:changed. */
export function parseRemoteArgs(argv, env = {}) {
  const a = {
    host: env.JOVIE_REMOTE_PREFLIGHT_HOST || DEFAULT_HOST,
    slots:
      Number.parseInt(env.JOVIE_REMOTE_PREFLIGHT_SLOTS ?? '', 10) ||
      DEFAULT_SLOTS,
    push: true,
    dryRun: false,
    repo: process.cwd(),
    bodyFile: undefined,
    forward: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const f = argv[i];
    if (f === '--host') a.host = argv[++i];
    else if (f === '--no-push') a.push = false;
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--repo') a.repo = path.resolve(argv[++i]);
    else if (f === '--body-file') a.bodyFile = argv[++i];
    else a.forward.push(f);
    // flags that take a value must forward the value too
    if (['--base', '--pr', '--title'].includes(f)) a.forward.push(argv[++i]);
  }
  return a;
}

const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** The bash program streamed to `ssh <host> bash -s`. Pure so tests can inspect it. */
export function buildRemoteScript({
  slug,
  branch,
  sha,
  originUrl,
  slots,
  forward,
  bodyB64,
}) {
  const fwd = forward.map(q).join(' ');
  return `set -euo pipefail
ROOT="$HOME/wt/remote-preflight"
REPO="$ROOT/_repo"
DIR="$ROOT/${slug}"
mkdir -p "$ROOT" "$HOME/.cache/gem-remote-preflight-slots"
t0=$(date +%s)
# 1. worktree (serialised: git worktree/branch config races under parallel runs)
exec 8>"$ROOT/.git.lock"; flock 8
if [ ! -d "$REPO/.git" ]; then
  git clone --quiet --filter=blob:none ${q(originUrl)} "$REPO"
fi
git -C "$REPO" fetch --quiet --no-tags origin ${q(`+refs/heads/${branch}:refs/remotes/origin/${branch}`)} main
if [ -d "$DIR" ]; then
  git -C "$DIR" checkout --quiet --force --detach ${q(sha)}
else
  git -C "$REPO" worktree add --quiet --detach "$DIR" ${q(sha)}
fi
exec 8>&-
# 2. node from .nvmrc via user-level nvm, then cached install from the shared store
export NVM_DIR="$HOME/.nvm"; set +u; . "$NVM_DIR/nvm.sh"
cd "$DIR"
nvm use --silent >/dev/null 2>&1 || nvm install >/dev/null
set -u
export npm_config_store_dir="$HOME/.cache/remote-preflight/pnpm-store"
stamp="$(sha256sum pnpm-lock.yaml | cut -c1-16)-$(node -v)"
if [ ! -d node_modules ] || [ "$(cat .remote-preflight-stamp 2>/dev/null)" != "$stamp" ]; then
  echo "[preflight:remote] pnpm install ($stamp)" >&2
  pnpm install --frozen-lockfile --prefer-offline --reporter=silent
  echo "$stamp" > .remote-preflight-stamp
fi
# 3. host-wide concurrency gate: flock slots, queue instead of fail
slot=""
announced=0
while [ -z "$slot" ]; do
  for i in $(seq 0 $((${slots} - 1))); do
    exec 9>"$HOME/.cache/gem-remote-preflight-slots/slot-$i.lock"
    if flock -n 9; then slot=$i; break; fi
  done
  if [ -z "$slot" ]; then
    [ $announced = 1 ] || { echo "[preflight:remote] all ${slots} remote slots busy; queued." >&2; announced=1; }
    sleep 2
  fi
done
# 4. body file
body_args=()
${bodyB64 ? `mkdir -p "$ROOT/.bodies"; printf %s ${q(bodyB64)} | base64 -d > "$ROOT/.bodies/${slug}.md"; body_args=(--body-file "$ROOT/.bodies/${slug}.md")` : ''}
echo "[preflight:remote] ${slug} @ ${sha.slice(0, 9)} slot $slot setup $(( $(date +%s) - t0 ))s" >&2
set +e
# Fork-storm containment: run inside agent-preflight.slice (TasksMax 512) when installed on the host
# (scripts/capacity/install-agent-slices.sh); otherwise a plain run.
RUN=""; [ -x "$HOME/.local/bin/agent-run" ] && RUN="$HOME/.local/bin/agent-run preflight"
timeout 45m nice -n 10 $RUN pnpm preflight:changed ${fwd} "\${body_args[@]}"
rc=$?
echo "[preflight:remote] exit $rc total $(( $(date +%s) - t0 ))s" >&2
exit $rc
`;
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: r.stderr };
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
} = {}) {
  const a = parseRemoteArgs(argv, env);
  const branch = git(a.repo, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  const sha = git(a.repo, ['rev-parse', 'HEAD']).out;
  if (!branch || branch === 'HEAD' || branch === 'main') {
    console.error('[preflight:remote] needs a feature branch checked out');
    return 2;
  }
  if (git(a.repo, ['status', '--porcelain']).out)
    console.error(
      '[preflight:remote] warning: uncommitted changes are NOT sent; commit them first'
    );
  const originUrl = git(a.repo, ['remote', 'get-url', 'origin']).out;
  const bodyB64 = a.bodyFile
    ? readFileSync(a.bodyFile).toString('base64')
    : undefined;
  const script = buildRemoteScript({
    slug: branchSlug(branch),
    branch,
    sha,
    originUrl,
    slots: a.slots,
    forward: a.forward,
    bodyB64,
  });
  if (a.dryRun) {
    console.log(script);
    return 0;
  }
  if (a.push) {
    const p = spawnSync(
      'git',
      ['push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`],
      { cwd: a.repo, stdio: 'inherit' }
    );
    if (p.status !== 0) return p.status ?? 1;
  } else {
    git(a.repo, ['fetch', '--quiet', 'origin', branch]);
    if (git(a.repo, ['rev-parse', `origin/${branch}`]).out !== sha) {
      console.error(`[preflight:remote] origin/${branch} != HEAD; push first`);
      return 2;
    }
  }
  return new Promise(resolve => {
    const child = spawn('ssh', [a.host, 'bash', '-s'], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.stdin.end(script);
    child.on('error', () => resolve(127));
    child.on('close', (code, sig) => resolve(code ?? (sig ? 143 : 1)));
  });
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  process.exitCode = await main();
}
