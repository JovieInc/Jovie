// Pure helpers for the parallel headless Pen CLI harness (see README.md).
// sliceDoc: cut a small per-job input out of a large .pen document.
// diffDocs: the fan-in guard that proves a run only added frames.
import { createHash } from 'node:crypto';

/**
 * @typedef {{ id: string, type?: string, name?: string, ref?: string, children?: PenNode[], [key: string]: unknown }} PenNode
 * @typedef {{ version?: string, children: PenNode[], [key: string]: unknown }} PenDoc
 */

/** @param {PenNode} n @returns {number} */
export const countNodes = n =>
  1 + (n.children || []).reduce((a, c) => a + countNodes(c), 0);

/**
 * Target top-level frames plus every reusable component they reference, transitively.
 * Refs also hide inside override objects, so every nested value is scanned. Only the
 * outermost components are lifted to top level (off-canvas); lifting a component that
 * already sits inside a target or another lifted component would duplicate ids.
 * Ids are preserved, so a frame built in the slice still resolves its refs in the real file.
 * @param {PenDoc} doc
 * @param {string[]} targets
 * @returns {{ slice: PenDoc, components: number, nodes: number }}
 */
export function sliceDoc(doc, targets) {
  /** @type {Map<string, PenNode>} */
  const byId = new Map();
  /** @param {PenNode} n */
  const index = n => {
    byId.set(n.id, n);
    (n.children || []).forEach(index);
  };
  doc.children.forEach(index);
  const missing = targets.filter(id => !doc.children.some(n => n.id === id));
  if (missing.length)
    throw new Error(`not top-level frames: ${missing.join(', ')}`);

  /** @type {Map<string, PenNode>} */
  const comps = new Map();
  /** @param {unknown} v */
  const collect = v => {
    if (Array.isArray(v)) return v.forEach(collect);
    if (!v || typeof v !== 'object') return;
    const ref = /** @type {{ ref?: unknown }} */ (v).ref;
    if (typeof ref === 'string' && !comps.has(ref)) {
      const target = byId.get(ref);
      if (target) {
        comps.set(ref, target);
        collect(target);
      }
    }
    Object.values(v).forEach(collect);
  };
  targets.forEach(id => collect(byId.get(id)));

  /** @param {PenNode} root @param {string} id */
  const contains = (root, id) => {
    let found = false;
    /** @param {PenNode} n */
    const walk = n => {
      if (found) return;
      if (n.id === id) found = true;
      else (n.children || []).forEach(walk);
    };
    (root.children || []).forEach(walk);
    return found;
  };
  const roots = [
    ...targets.map(t => /** @type {PenNode} */ (byId.get(t))),
    ...comps.values(),
  ];
  const outermost = [...comps.values()].filter(
    c =>
      !targets.includes(c.id) &&
      !roots.some(r => r.id !== c.id && contains(r, c.id))
  );
  let y = 0;
  const lifted = outermost.map(c => {
    const node = { ...c, x: -200000, y };
    y += (typeof c.height === 'number' ? c.height : 2000) + 200;
    return node;
  });
  const slice = {
    ...doc,
    children: [...doc.children.filter(n => targets.includes(n.id)), ...lifted],
  };
  return {
    slice,
    components: lifted.length,
    nodes: slice.children.reduce((a, n) => a + countNodes(n), 0),
  };
}

const LAYOUT = new Set(['x', 'y', 'width', 'height']);
const FILL = /^fill_container(\(\d+\))?$/;

/**
 * Key-order independent canonical form (pen rewrites key order on save). With strip, layout
 * values that headless pen legitimately recomputes are zeroed: numbers, null (written when
 * text measurement fails) and fill_container(0) (a sliced top-level component).
 * @param {unknown} v @param {boolean} strip @returns {unknown}
 */
function canon(v, strip) {
  if (Array.isArray(v)) return v.map(x => canon(x, strip));
  if (!v || typeof v !== 'object') return v;
  const o = /** @type {Record<string, unknown>} */ (v);
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map(k => {
        const val = o[k];
        const layout =
          strip &&
          LAYOUT.has(k) &&
          (typeof val === 'number' ||
            val === null ||
            (typeof val === 'string' && FILL.test(val)));
        return [k, layout ? 0 : canon(val, strip)];
      })
  );
}

/** @param {unknown} n @param {boolean} strip */
const sha = (n, strip) =>
  createHash('sha1')
    .update(JSON.stringify(canon(n, strip)))
    .digest('hex');

/**
 * Compare a run's output against its input by top-level frame.
 * changed = semantic edits to pre-existing frames; reflowed = layout-only drift.
 * ok is false when anything pre-existing was removed or semantically changed.
 * @param {PenDoc} src @param {PenDoc} run
 */
export function diffDocs(src, run) {
  /** @param {PenDoc} d */
  const index = d =>
    new Map(
      d.children.map(n => [
        n.id,
        {
          name: n.name,
          nodes: countNodes(n),
          h: sha(n, false),
          hs: sha(n, true),
        },
      ])
    );
  const a = index(src);
  const b = index(run);
  const added = [...b]
    .filter(([id]) => !a.has(id))
    .map(([id, v]) => ({ id, name: v.name, nodes: v.nodes }));
  const removed = [...a.keys()].filter(id => !b.has(id));
  const differ = [...a].filter(([id, v]) => {
    const r = b.get(id);
    return r !== undefined && r.h !== v.h;
  });
  const changed = differ
    .filter(([id, v]) => b.get(id)?.hs !== v.hs)
    .map(([id, v]) => ({ id, name: v.name }));
  const reflowed = differ
    .filter(([id, v]) => b.get(id)?.hs === v.hs)
    .map(([id]) => id);
  return {
    version: run.version,
    top: run.children.length,
    added,
    removed,
    changed,
    reflowed,
    ok: removed.length === 0 && changed.length === 0,
  };
}
