// Load-aware pre-push gate helpers. Pure functions so the hook is testable.
// Policy: the gate never weakens. Under load (or on a timeout) the identical
// gate runs on Gem and its pass, bound to the exact HEAD sha + tree, is the
// evidence for the push.

export const DEFAULT_LOAD_FACTOR = 1.5;
export const EVIDENCE_MARKER = 'PREFLIGHT_REMOTE_EVIDENCE';

/** 1-minute load above cores x factor means this host is saturated. */
export function isOverloaded({ load, cores, env = process.env }) {
  const factor =
    Number.parseFloat(env.JOVIE_PREPUSH_LOAD_FACTOR ?? '') ||
    DEFAULT_LOAD_FACTOR;
  return load > cores * factor;
}

/** local | remote. JOVIE_PREPUSH_REMOTE=1 forces Gem, =0 forces local. */
export function chooseMode({ load, cores, env = process.env }) {
  if (env.JOVIE_PREPUSH_REMOTE === '1') return 'remote';
  if (
    env.JOVIE_PREPUSH_REMOTE === '0' ||
    env.CI ||
    env.JOVIE_PREFLIGHT_CHANGED === '0'
  )
    return 'local';
  return isOverloaded({ load, cores, env }) ? 'remote' : 'local';
}

const TIMEOUT_RE =
  /timed out|timeout of \d+|ETIMEDOUT|exceeded (?:the )?timeout|SIGKILL|SIGTERM|did not complete within|test timed out/i;

/** A kill/timeout is an infrastructure failure, not a verdict on the code. */
export function isInfraTimeout({ code, out = '' }) {
  if (code === 0) return false;
  if (code === 137 || code === 143) return true;
  return TIMEOUT_RE.test(out);
}

export function formatEvidence(ev) {
  return `${EVIDENCE_MARKER} ${JSON.stringify(ev)}`;
}

/** Last evidence line in remote output, or null. */
export function parseEvidence(out) {
  const lines = out.split('\n').filter(l => l.startsWith(EVIDENCE_MARKER));
  if (!lines.length) return null;
  try {
    return JSON.parse(lines.at(-1).slice(EVIDENCE_MARKER.length + 1));
  } catch {
    return null;
  }
}

/** Passing evidence for exactly this commit and tree, or false. */
export function evidenceMatches(ev, { sha, tree }) {
  return Boolean(
    ev && ev.rc === 0 && ev.sha === sha && ev.tree === tree && sha && tree
  );
}

/**
 * local -> gem -> actions. Local when local load is fine; else Gem when its
 * load (1m / cores) is fine; else GitHub-hosted runners. gem null = unreadable.
 */
export function chooseBackend({ load, cores, gem = null, env = {} }) {
  const forced = env.JOVIE_PREPUSH_BACKEND;
  if (['local', 'gem', 'actions'].includes(forced)) return forced;
  if (chooseMode({ load, cores, env }) === 'local') return 'local';
  if (gem && gem.cores && gem.load <= gem.cores * 1.5) return 'gem';
  return 'actions';
}
