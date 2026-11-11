import { createHash } from 'node:crypto';

export const READY_SUFFIX = ' · ready for Tim';
/** "PROPOSAL / …" at the start or "· PROPOSAL" as a segment; never the big "PROPOSAL AREA" boards. */
export const PROPOSAL_RE = /^PROPOSAL\s*[/·]|·\s*PROPOSAL\s*(?:·|$)/;

/** Content digest of a frame, ignoring its own name (the ready marker). */
export function frameDigest(tree) {
  const { name: _name, ...rest } = tree ?? {};
  return createHash('sha256').update(stableJson(rest)).digest('hex');
}

export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

export function stripReady(name) {
  return String(name ?? '').replace(/ · ready for Tim(?: r[0-9a-f]{8})?$/, '');
}

export function markReady(name, receiptHash) {
  return `${stripReady(name)}${READY_SUFFIX} r${String(receiptHash).slice(0, 8)}`;
}

export function isProposalFrame(node) {
  return Boolean(node?.name) && PROPOSAL_RE.test(stripReady(node.name).trim());
}
