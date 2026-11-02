/**
 * canon/sources-of-truth.json: the one map from fact domain to its owner.
 * Validation and rendering live here; the CLI is scripts/sources-of-truth.mjs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SOT_PATH = 'canon/sources-of-truth.json';
export const SOT_DOC_PATH = 'canon/SOURCES_OF_TRUTH.md';
export const SOT_SCHEMA = 'jovie-sources-of-truth/v1';

export function readSourcesOfTruth(root) {
  return JSON.parse(readFileSync(resolve(root, SOT_PATH), 'utf8'));
}

/** Returns a list of problems; empty means the map is sound. */
export function validateSourcesOfTruth(map, root) {
  const problems = [];
  const exists = ref => existsSync(resolve(root, ref));
  if (map.schema !== SOT_SCHEMA) problems.push(`schema must be ${SOT_SCHEMA}`);
  const seen = new Set();
  const owned = new Map();
  for (const d of map.domains ?? []) {
    const at = `domain ${d.id ?? '<no id>'}`;
    if (!/^[a-z0-9-]+$/.test(d.id ?? '')) problems.push(`${at}: bad id`);
    if (seen.has(d.id)) problems.push(`${at}: duplicate id`);
    seen.add(d.id);
    if (!d.title) problems.push(`${at}: title required`);
    const o = d.owner;
    if (!o || !map.ownerKinds?.[o.kind]) {
      problems.push(
        `${at}: owner.kind must be one of ${Object.keys(map.ownerKinds ?? {})}`
      );
      continue;
    }
    if (o.kind === 'external' && !o.authority)
      problems.push(`${at}: external owner needs authority`);
    if (!o.ref) problems.push(`${at}: owner.ref required`);
    else if (!exists(o.ref))
      problems.push(`${at}: owner.ref ${o.ref} does not exist`);
    if (
      o.ref &&
      owned.has(o.ref) &&
      owned.get(o.ref) !== d.id &&
      !d.sharesOwnerWith
    )
      problems.push(
        `${at}: owner.ref ${o.ref} is already the owner of ${owned.get(o.ref)}; one owner per domain (set sharesOwnerWith only if the file holds two facts)`
      );
    if (o.ref) owned.set(o.ref, owned.get(o.ref) ?? d.id);
    for (const ref of d.derived ?? [])
      if (!exists(ref)) problems.push(`${at}: derived ${ref} does not exist`);
    if ((d.derived ?? []).includes(o.ref))
      problems.push(`${at}: owner listed as its own derived surface`);
  }
  return problems;
}

export function renderSourcesOfTruth(map) {
  const rows = map.domains.map(d => {
    const owner =
      d.owner.kind === 'external'
        ? `${d.owner.authority} (mirror: \`${d.owner.ref}\`)`
        : `\`${d.owner.ref}\``;
    const pending = d.owner.pendingPr
      ? ` (moves to #${d.owner.pendingPr})`
      : '';
    const derived = (d.derived ?? []).map(x => `\`${x}\``).join('<br>') || '-';
    return `| ${d.title} | ${d.owner.kind} | ${owner}${pending} | ${derived} | ${d.liveAuthority ?? '-'} |`;
  });
  return [
    '<!-- Generated from canon/sources-of-truth.json by scripts/sources-of-truth.mjs --write. Do not edit. -->',
    '',
    '# Sources of truth',
    '',
    map.rule,
    '',
    'Machine-readable map: [`sources-of-truth.json`](./sources-of-truth.json). Rule for agents: [`.claude/rules/source-of-truth.md`](../.claude/rules/source-of-truth.md).',
    '',
    '| Fact domain | Owner kind | One owner | Derived surfaces | Live authority checked against |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    ...map.domains
      .filter(d => d.owner.note)
      .map(d => `- **${d.title}.** ${d.owner.note}`),
    '',
  ].join('\n');
}
