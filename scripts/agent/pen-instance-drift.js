/* pen-instance-drift v1: run inside the Pen MCP `execute` tool.
 * After editing a reusable master, lists every instance that does not show
 * the master's current values, and why:
 *   STALE_CACHE  no override, yet the resolved instance differs from the master
 *                (Pen does not re-resolve existing instances when a master gains
 *                a property it did not have before; fresh instances are fine)
 *   OVERRIDE     an explicit instance override differs from the master
 *                (intentional unless listed in CONFIG.stale)
 *   STALE        an override listed in CONFIG.stale (blocks the master change)
 *   ORPHANED     an override sits under a node the master now disables, so it
 *                no longer renders
 * mode "before": snapshot masters (call before editing; persists in globals)
 * mode "report": print findings (default)
 * Pen quirk this exists for (2026-10-26): Update() cannot delete an override key,
 * and existing instances keep a stale resolution when a master gains a property
 * it did not have. Re-instantiating (Replace with the kept overrides) fixes both.
 * New ids: instances referenced by path from another node's overrides are
 * skipped and reported; fix those with explicit overrides in the parent.
 * mode "repair": re-instantiate each affected direct instance with stale
 *                overrides dropped, CONFIG.moves applied and, if
 *                CONFIG.reenableOrphans, orphan ancestors re-enabled.
 * Edit CONFIG, then send this whole file as the execute `input`.
 */
const CONFIG = {
  masters: ['YDvc8'],
  mode: 'report',
  fields: [
    'w',
    'h',
    'content',
    'enabled',
    'fontSize',
    'fontWeight',
    'fill',
    'opacity',
    'cornerRadius',
    'padding',
    'gap',
  ],
  ignoreRoot: true,
  stale: {}, // { masterId: { 'path': ['field', ...] } }
  moves: {}, // { masterId: { fromPath: { to: 'toPath', fields: ['fill'] } } } move override fields to a new owner node
  reenableOrphans: false,
  showOverrides: false,
  maxRows: 40,
};

const snap = root => {
  const out = {};
  const last = root.split('/').pop();
  Get(
    root,
    (n, c) => {
      const parts = n.id.split('/');
      const rel =
        c.depth === 0 ? '' : parts.slice(parts.lastIndexOf(last) + 1).join('/');
      const anc = [];
      for (let p = c.parentCtx; p && p.depth > 0; p = p.parentCtx)
        anc.push(
          p.node.id
            .split('/')
            .slice(p.node.id.split('/').lastIndexOf(last) + 1)
            .join('/')
        );
      out[rel] = {
        anc,
        w: Math.round(c.bounds.width),
        h: Math.round(c.bounds.height),
        content: n.content,
        enabled: n.enabled !== false,
        fontSize: n.fontSize,
        fontWeight: n.fontWeight,
        fill: n.fill,
        opacity: n.opacity,
        cornerRadius: n.cornerRadius,
        padding: n.padding,
        gap: n.gap,
      };
    },
    { resolveInstances: true }
  );
  return out;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const overrideFor = (desc, rel) => {
  const tail = rel.split('/').pop();
  for (const [k, v] of Object.entries(desc || {}))
    if (k === rel || k === tail || rel.endsWith('/' + k)) return [k, v];
  return null;
};
const fieldKey = f => (f === 'w' ? 'width' : f === 'h' ? 'height' : f);
globalThis.__penDrift = globalThis.__penDrift || {};

for (const M of CONFIG.masters) {
  if (CONFIG.mode === 'before') {
    __penDrift[M] = snap(M);
    Print(`snapshot ${M}: ${Object.keys(__penDrift[M]).length} nodes`);
    continue;
  }
  const now = snap(M);
  const before = __penDrift[M];
  const disabled = Object.keys(now).filter(p => p && !now[p].enabled);
  const hidden = rel =>
    !now[rel].enabled || now[rel].anc.some(a => now[a] && !now[a].enabled);
  const META = new Set(['context', 'name']);
  const instances = [];
  Get(n => {
    if (n.type === 'ref' && n.ref === M) instances.push(n.id);
  });
  const referenced = new Set();
  Get(n => {
    for (const k of Object.keys(n.descendants || {}))
      for (const id of instances)
        if (k.split('/').includes(id)) referenced.add(id);
  });
  const counts = {
    STALE_CACHE: 0,
    OVERRIDE: 0,
    STALE: 0,
    ORPHANED: 0,
    RETIRED: 0,
  };
  const rows = [];
  const repairs = [];
  for (const id of instances) {
    const node = Get(id, { depth: 0 });
    const desc = node.descendants || {};
    const inst = snap(id);
    const staleKeys = {};
    let needsReinstance = false;
    const overridden = Object.keys(desc)
      .map(k => Object.keys(now).find(q => q === k || q.endsWith('/' + k)))
      .filter(Boolean);
    const contentDriven = rel =>
      overridden.some(q => q === rel || now[q].anc.includes(rel));
    for (const [rel, mv] of Object.entries(now)) {
      if (CONFIG.ignoreRoot && rel === '') continue;
      const iv = inst[rel];
      if (!iv) continue;
      const ov = overrideFor(desc, rel);
      for (const f of CONFIG.fields) {
        if (before && before[rel] && eq(before[rel][f], mv[f])) continue; // only fields the master changed
        if (eq(mv[f], iv[f])) continue;
        if (hidden(rel)) continue; // nothing renders there
        if ((f === 'w' || f === 'h') && ov) continue;
        if (f === 'w' && inst[''].w !== now[''].w) continue; // child widths follow the instance's own size
        if (f === 'h' && (inst[''].w !== now[''].w || contentDriven(rel)))
          continue; // heights reflow with size and overridden copy
        let kind = 'STALE_CACHE';
        if (ov && fieldKey(f) in ov[1]) {
          const listed = (CONFIG.stale[M] || {})[ov[0]] || [];
          const wasDefault = before && before[rel] && eq(before[rel][f], iv[f]);
          kind =
            listed.includes(fieldKey(f)) || wasDefault ? 'STALE' : 'OVERRIDE';
          if (kind === 'STALE')
            (staleKeys[ov[0]] = staleKeys[ov[0]] || []).push(fieldKey(f));
        } else needsReinstance = true;
        counts[kind]++;
        if (
          (kind !== 'OVERRIDE' || CONFIG.showOverrides) &&
          rows.length < CONFIG.maxRows
        )
          rows.push(
            `${kind} ${id} ${rel} ${f}: master=${String(JSON.stringify(mv[f])).slice(0, 36)} inst=${String(JSON.stringify(iv[f])).slice(0, 36)}`
          );
      }
    }
    for (const k of Object.keys(desc)) {
      const full = Object.keys(now).find(q => q === k || q.endsWith('/' + k));
      if (
        !full ||
        Object.keys(desc[k] || {}).every(f => META.has(f)) ||
        'enabled' in (desc[k] || {})
      )
        continue;
      const parent = [full, ...now[full].anc].find(d => disabled.includes(d));
      if (!parent || (desc[parent] && desc[parent].enabled === true)) continue;
      if (parent === full) {
        counts.RETIRED++;
        continue;
      } // the master retired this node itself; leave it off
      counts.ORPHANED++;
      if (rows.length < CONFIG.maxRows)
        rows.push(`ORPHANED ${id} override ${k} under disabled ${parent}`);
      if (CONFIG.reenableOrphans)
        (staleKeys.__enable = staleKeys.__enable || new Set()).add(parent);
    }
    const moves = CONFIG.moves[M] || {};
    const hasMove = Object.entries(moves).some(
      ([k, m]) => desc[k] && m.fields.some(f => f in desc[k])
    );
    for (const [k, fs] of Object.entries(CONFIG.stale[M] || {})) {
      const hit = desc[k] ? fs.filter(f => f in desc[k]) : [];
      if (!hit.length) continue;
      staleKeys[k] = [...new Set([...(staleKeys[k] || []), ...hit])];
      counts.STALE += hit.length;
      if (rows.length < CONFIG.maxRows)
        rows.push(`STALE ${id} ${k} ${hit.join(',')} (listed in CONFIG.stale)`);
    }
    if (needsReinstance || Object.keys(staleKeys).length || hasMove)
      repairs.push({ id, staleKeys });
  }
  Print(
    `== ${M}: ${instances.length} instances · ${JSON.stringify(counts)} · to repair ${repairs.length}`
  );
  for (const r of rows) Print(r);
  if (CONFIG.mode !== 'repair') continue;
  for (const { id, staleKeys } of repairs) {
    if (id.includes('/') || referenced.has(id)) {
      Print(
        `SKIP ${id}: nested or referenced by path elsewhere; fix in its parent master`
      );
      continue;
    }
    const node = Get(id); // full depth: replacement overrides keep their children
    if (JSON.stringify(node).includes('"..."')) {
      Print(`SKIP ${id}: elided subtree`);
      continue;
    }
    const desc = JSON.parse(JSON.stringify(node.descendants || {}));
    for (const [k, fs] of Object.entries(staleKeys)) {
      if (k === '__enable') continue;
      if (!desc[k]) continue;
      for (const f of fs) delete desc[k][f];
      if (!Object.keys(desc[k]).length) delete desc[k];
    }
    for (const [from, m] of Object.entries(CONFIG.moves[M] || {})) {
      if (!desc[from]) continue;
      for (const f of m.fields)
        if (f in desc[from]) {
          desc[m.to] = { ...(desc[m.to] || {}), [f]: desc[from][f] };
          delete desc[from][f];
        }
      if (!Object.keys(desc[from]).length) delete desc[from];
    }
    for (const p of staleKeys.__enable || [])
      desc[p] = { ...(desc[p] || {}), enabled: true };
    const props = { ...node, descendants: desc };
    delete props.id;
    // Replace fails inside a reusable master; there, insert a fresh instance at the same index.
    let par,
      idx,
      inMaster = false;
    Get((n, c) => {
      if (n.id === id) {
        par = c.parentCtx && c.parentCtx.node.id;
        idx = c.index;
        for (let q = c.parentCtx; q; q = q.parentCtx)
          if (q.node.reusable) inMaster = true;
      }
    });
    let nid;
    if (inMaster && par) {
      nid = Insert(par, props);
      Move(nid, par, idx);
      Delete(id);
    } else nid = Replace(id, props);
    Print(
      `REPAIRED ${id} -> ${nid} (${Object.keys(desc).length} overrides kept)`
    );
  }
}
