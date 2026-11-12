// Shared semantic for checked-in debt baselines ("this many known violations
// per key, and no more").
//
// The old shape was exact-match: a check failed when a count grew AND when it
// shrank without the same tree rewriting the shared baseline file. The second
// half is what broke the merge queue: a PR that removed debt turned every
// later merge group red until someone rewrote one shared JSON file, and two
// green PRs that each rewrote it could not combine (2026-11-04..11: 94 of 322
// failed merge groups were baseline-class).
//
// The semantic here:
//   - growth fails. A count above its baseline (or any count for a key with no
//     baseline) is a new violation.
//   - a shrink passes. Removing debt never requires touching the baseline, so
//     no two PRs have to edit the same file to stay green together.
//   - the baseline is tightened afterwards by `tightenBaseline`, which only
//     ever lowers or deletes entries. It can never raise a count or add a key,
//     so running it cannot hide a regression the way a blanket "--update"
//     rewrite can. `scripts/baselines-tighten.mjs` runs it for every guard in
//     `scripts/lib/queue-drift-guards.json`.
//
// A baseline is a tree of objects whose leaves are non-negative integers, for
// example `{ "file.tsx": { "rule": 2 } }` or `{ "rule::file.tsx": 2 }`.

const isBranch = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function assertCount(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `baseline leaf ${path.join(' > ')} must be a non-negative integer; got ${JSON.stringify(value)}`
    );
  }
}

/** Every leaf of a count tree as `{ path, count }`. */
export function countLeaves(tree, prefix = []) {
  const out = [];
  for (const [key, value] of Object.entries(tree ?? {})) {
    const path = [...prefix, key];
    if (isBranch(value)) out.push(...countLeaves(value, path));
    else {
      assertCount(value, path);
      out.push({ path, count: value });
    }
  }
  return out;
}

function leafAt(tree, path) {
  let node = tree;
  for (const key of path) {
    if (!isBranch(node) || !Object.hasOwn(node, key)) return 0;
    node = node[key];
  }
  return isBranch(node) ? 0 : node;
}

const byPath = (a, b) => a.path.join('\0').localeCompare(b.path.join('\0'));

/**
 * Compare measured counts with the committed baseline.
 * `growth` must fail the check; `shrink` is stale headroom and must not.
 */
export function compareToBaseline(current, baseline) {
  const growth = [];
  const shrink = [];
  for (const { path, count } of countLeaves(current)) {
    const allowed = leafAt(baseline, path);
    if (count > allowed) growth.push({ path, count, baseline: allowed });
  }
  for (const { path, count: allowed } of countLeaves(baseline)) {
    const count = leafAt(current, path);
    if (count < allowed) shrink.push({ path, count, baseline: allowed });
  }
  return { growth: growth.sort(byPath), shrink: shrink.sort(byPath) };
}

/**
 * The baseline with every leaf lowered to `min(baseline, current)`; leaves at
 * zero and emptied branches are removed. Key order is kept. Never raises a
 * count and never adds a key, so growth stays a failure after tightening.
 */
export function tightenBaseline(current, baseline) {
  const walk = (node, path) => {
    const next = {};
    for (const [key, value] of Object.entries(node)) {
      const here = [...path, key];
      if (isBranch(value)) {
        const child = walk(value, here);
        if (Object.keys(child).length > 0) next[key] = child;
        continue;
      }
      assertCount(value, here);
      const count = Math.min(value, leafAt(current, here));
      if (count > 0) next[key] = count;
    }
    return next;
  };
  return {
    baseline: walk(baseline ?? {}, []),
    tightened: compareToBaseline(current, baseline).shrink,
  };
}

/**
 * Tell the author about stale headroom without failing them. In GitHub Actions
 * this is one notice annotation per guard, not one per key.
 */
export function announceShrink(
  guard,
  shrink,
  { env = process.env, log = console.log } = {}
) {
  if (shrink.length === 0) return '';
  const sample = shrink
    .slice(0, 3)
    .map(item => `${item.path.join(' > ')} ${item.baseline} -> ${item.count}`)
    .join('; ');
  const message =
    `${guard}: ${shrink.length} baseline entr${shrink.length === 1 ? 'y is' : 'ies are'} ` +
    `above the measured count (${sample}${shrink.length > 3 ? '; ...' : ''}). ` +
    'This passes. `node scripts/baselines-tighten.mjs` lowers the baseline; it never raises one.';
  log(
    env.GITHUB_ACTIONS === 'true'
      ? `::notice title=baseline can be tightened::${message}`
      : message
  );
  return message;
}
