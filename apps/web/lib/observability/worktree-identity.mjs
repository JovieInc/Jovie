/** Local development correlation only; never a deployment or clean-tree proof. */
export const WORKTREE_IDENTITY_ENV = 'NEXT_PUBLIC_JOVIE_WORKTREE_IDENTITY';

/** @typedef {{id: string, head: string, boot: string, port: number}} WorktreeIdentity */

/** @param {unknown} value @returns {WorktreeIdentity | null} */
export function parseWorktreeIdentity(value) {
  try {
    const item = typeof value === 'string' ? JSON.parse(value) : value;
    if (
      !item ||
      typeof item !== 'object' ||
      !/^wt_[a-f0-9]{24}$/.test(item.id) ||
      !/^[a-f0-9]{40}$/.test(item.head) ||
      !/^[a-f0-9]{32}$/.test(item.boot) ||
      !Number.isInteger(item.port) ||
      item.port < 1 ||
      item.port > 65535 ||
      Object.keys(item).sort().join(',') !== 'boot,head,id,port'
    )
      return null;
    return { id: item.id, head: item.head, boot: item.boot, port: item.port };
  } catch {
    return null;
  }
}

/** @param {WorktreeIdentity | null} identity @returns {Record<string, string>} */
export function worktreeAttributes(identity) {
  return identity
    ? {
        'jovie.worktree.id': identity.id,
        'jovie.worktree.head': identity.head,
        'jovie.worktree.boot': identity.boot,
      }
    : {};
}

/** @param {string} url */
export function isLoopbackOrigin(url) {
  try {
    const parsed = new URL(url);
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/** Fail before tests/seeding when a reused port belongs to another checkout/head. */
/** @param {{id: string, head: string, port: number}} expected @param {unknown} actual */
export function assertWorktreeIdentity(expected, actual) {
  const observed = parseWorktreeIdentity(actual);
  if (
    !observed ||
    observed.id !== expected.id ||
    observed.head !== expected.head ||
    observed.port !== expected.port
  ) {
    throw new Error(
      'Worktree identity mismatch: restart the intended checkout on its selected port before testing.'
    );
  }
  return observed;
}
