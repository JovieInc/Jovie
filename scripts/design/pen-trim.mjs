/**
 * The cut-down copy of the canonical Pen document a draft can start from
 * (PEN_DRAFT_TRIM=1 in pen-draft.mjs), and the splice that puts the drafted
 * frame back into the whole document.
 */
/** Each top-level frame's index, keyed by every node id inside it. */
function topLevelIndex(doc) {
  const index = new Map();
  doc.children.forEach((top, i) => {
    const walk = node => {
      if (node?.id) index.set(node.id, i);
      for (const child of node?.children ?? []) walk(child);
    };
    walk(top);
  });
  return index;
}

function collect(node, test, out = []) {
  if (test(node)) out.push(node);
  for (const child of node?.children ?? []) collect(child, test, out);
  return out;
}

const words = text =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Terms that name the screens a brief builds on: its `context` list, plus
 * the longer words of its frame and route. Each term matches whole words
 * of a frame name, so "sign in" never matches "Design".
 */
export function briefTerms(brief) {
  const fromName = words(`${brief.frame} ${brief.route ?? ''}`).filter(
    w => w.length >= 4
  );
  return [
    ...new Set(
      [...fromName, ...(brief.context ?? [])].map(t => words(t).join(' '))
    ),
  ].filter(Boolean);
}

const namesTerm = (name, term) =>
  ` ${words(name).join(' ')} `.includes(` ${term} `);

/**
 * The canonical document cut down to what one brief needs: every top-level
 * frame that holds a reusable component, every frame named by one of the
 * brief's terms (see briefTerms), and every frame those reference,
 * with all variables and themes. On Nov 8, 9 of 10 drafts failed because
 * the Pen editor never finished loading the whole 25 MB file ("Timeout
 * waiting for document"), so the agent never read or drew anything.
 */
export function trimCanonical(doc, brief) {
  const index = topLevelIndex(doc);
  const terms = briefTerms(brief);
  const keep = new Set();
  doc.children.forEach((top, i) => {
    if (
      terms.some(t => namesTerm(top?.name, t)) ||
      collect(top, n => n?.reusable === true).length
    )
      keep.add(i);
  });
  const queue = [...keep];
  while (queue.length) {
    const i = queue.pop();
    for (const ref of collect(
      doc.children[i],
      n => typeof n?.ref === 'string'
    )) {
      const j = index.get(ref.ref);
      if (j !== undefined && !keep.has(j)) {
        keep.add(j);
        queue.push(j);
      }
    }
  }
  return { ...doc, children: doc.children.filter((_, i) => keep.has(i)) };
}

/**
 * The full canonical document with the frames a draft added to its trimmed
 * copy, moved right of every existing frame so nothing overlaps, plus any
 * variables or themes the draft added. Existing frames stay as they were.
 */
export function spliceDraft(full, trimmed, drafted) {
  const had = new Set(trimmed.children.map(c => c?.id));
  const added = drafted.children.filter(c => !had.has(c?.id));
  const right = Math.max(
    0,
    ...full.children.map(c => (Number(c?.x) || 0) + (Number(c?.width) || 0))
  );
  const left = Math.min(...added.map(c => Number(c?.x) || 0));
  const shift = right + 400 - (Number.isFinite(left) ? left : 0);
  const merge = (base, extra) =>
    base || extra ? { ...(extra ?? {}), ...(base ?? {}) } : undefined;
  const out = {
    ...full,
    children: [
      ...full.children,
      ...added.map(c => ({ ...c, x: (Number(c?.x) || 0) + shift })),
    ],
  };
  const variables = merge(full.variables, drafted.variables);
  const themes = merge(full.themes, drafted.themes);
  if (variables) out.variables = variables;
  if (themes) out.themes = themes;
  return out;
}
