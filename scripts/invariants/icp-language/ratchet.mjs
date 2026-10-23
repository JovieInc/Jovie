/**
 * Shrink-only id ratchet. The recorded set must equal the live set, and
 * that set must stay a subset of the ancestor baseline once one exists.
 * New ids fail. Removing an id fails until the baseline file is lowered.
 */
import { spawnSync } from 'node:child_process';

export function diffIds(current, recorded) {
  const live = new Set(current);
  const known = new Set(recorded);
  return {
    added: current.filter(id => !known.has(id)),
    removed: recorded.filter(id => !live.has(id)),
  };
}

export function evaluateRatchet({ current, recorded, ancestor }) {
  /** @type {string[]} */
  const errors = [];
  const { added, removed } = diffIds(current, recorded);
  if (added.length > 0) {
    errors.push(
      `baseline is missing ${added.length} live id(s); do not add ids:\n${added
        .map(id => `  + ${id}`)
        .join('\n')}`
    );
  }
  if (removed.length > 0) {
    errors.push(
      `baseline can only shrink; delete ${removed.length} resolved id(s):\n${removed
        .map(id => `  - ${id}`)
        .join('\n')}`
    );
  }
  if (ancestor) {
    const ancestorSet = new Set(ancestor);
    const grown = current.filter(id => !ancestorSet.has(id));
    if (grown.length > 0) {
      errors.push(
        `new violations are not allowed (${grown.length}):\n${grown
          .map(id => `  + ${id}`)
          .join('\n')}`
      );
    }
  }
  if (current.length > recorded.length && added.length === 0) {
    errors.push(
      `icp-language count grew: ${current.length} > baseline ${recorded.length}`
    );
  }
  return errors;
}

export function ancestorJson(repoRoot, relPath) {
  const rev = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (rev.status !== 0) {
    return {
      ok: false,
      error:
        'origin/main is not available; the ratchet cannot prove it only shrinks',
    };
  }
  const spec = `origin/main:${relPath}`;
  const exists = spawnSync('git', ['cat-file', '-e', spec], { cwd: repoRoot });
  if (exists.status !== 0) return { ok: true, ancestor: null };
  const show = spawnSync('git', ['show', spec], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (show.status !== 0) {
    return { ok: false, error: `unable to read ${spec}` };
  }
  return { ok: true, ancestor: JSON.parse(show.stdout) };
}
