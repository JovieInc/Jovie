/** Shrink-only ids. New ids fail. Resolved ids fail until the file shrinks. */
import { spawnSync } from 'node:child_process';

export function diffIds(current, recorded) {
  const live = new Set(current);
  const known = new Set(recorded);
  return {
    added: current.filter(id => !known.has(id)),
    removed: recorded.filter(id => !live.has(id)),
  };
}
function listed(ids, sign) {
  return ids.map(id => `  ${sign} ${id}`).join('\n');
}
export function evaluateRatchet({ current, recorded, ancestor }) {
  const errors = [];
  const { added, removed } = diffIds(current, recorded);
  if (added.length > 0) {
    errors.push(
      `baseline is missing ${added.length} live id(s); do not add ids:\n${listed(added, '+')}`
    );
  }
  if (removed.length > 0) {
    errors.push(
      `baseline can only shrink; delete ${removed.length} resolved id(s):\n${listed(removed, '-')}`
    );
  }
  if (ancestor) {
    const known = new Set(ancestor);
    const grown = current.filter(id => !known.has(id));
    if (grown.length > 0) {
      errors.push(
        `new violations are not allowed (${grown.length}):\n${listed(grown, '+')}`
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
  const git = (args, encoding) =>
    spawnSync('git', args, { cwd: repoRoot, encoding });
  const rev = git(['rev-parse', '--verify', 'origin/main'], 'utf8');
  if (rev.status !== 0) {
    return {
      ok: false,
      error:
        'origin/main is not available; the ratchet cannot prove it only shrinks',
    };
  }
  const spec = `origin/main:${relPath}`;
  if (git(['cat-file', '-e', spec]).status !== 0) {
    return { ok: true, ancestor: null };
  }
  const show = git(['show', spec], 'utf8');
  if (show.status !== 0) return { ok: false, error: `unable to read ${spec}` };
  return { ok: true, ancestor: JSON.parse(show.stdout) };
}
