/**
 * Presentation-gate invariants (design-present/v1).
 *
 * Pure functions over a geometry snapshot produced by `collect.mjs` inside a
 * real browser. CI re-runs these from the committed `*.geometry.json`, so a
 * receipt cannot claim a pass the geometry does not support.
 *
 * Rule: never show Tim a screenshot that fails our invariants
 * (.claude/rules/design-present.md).
 */

/** Allowed drift from an axis, in CSS px. Optical alignment is exact. */
export const AXIS_TOLERANCE_PX = 0.5;
/** Content axis = content column left edge + this inset (Pen `app-panel-inset`). */
export const DEFAULT_AXIS_INSET_PX = 20;
/** Leaders left of this share of the column must sit on the start axis. */
export const LEFT_ANCHOR_SHARE = 1 / 3;
/** Text tabs above this size read as oversized (founder ban, 2026-10-28). */
export const TAB_MAX_FONT_PX = 13;
export const TAB_MAX_HEIGHT_PX = 32;
/** A painted box this small around a lone glyph is an icon tile. */
export const ICON_TILE_MAX_PX = 48;

const EMOJI = /\p{Extended_Pictographic}/u;

const round2 = n => Math.round(n * 100) / 100;

/**
 * Row leaders: each atom with no other atom to its left on the same visual
 * row (vertical overlap of at least half the smaller atom).
 */
export function rowLeaders(atoms) {
  const overlap = (a, b) => {
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const minH = Math.min(a.bottom - a.top, b.bottom - b.top);
    return minH > 0 && bottom - top >= minH / 2;
  };
  const leaders = [];
  for (const atom of atoms) {
    const row = atoms.filter(other => other === atom || overlap(atom, other));
    const leftmost = row.reduce((m, a) => (a.left < m.left ? a : m), atom);
    if (leftmost !== atom) continue;
    const right = Math.max(...row.map(a => a.right));
    leaders.push({ ...atom, rowRight: right, rowSize: row.length });
  }
  return leaders;
}

/** Every left-anchored row leader in the content column sits on one axis. */
export function checkContentAxis(snapshot, options = {}) {
  const inset = options.axisInset ?? DEFAULT_AXIS_INSET_PX;
  const { column } = snapshot;
  const axis = column.left + inset;
  const rightAxis = column.right - inset;
  const centre = (column.left + column.right) / 2;
  const failures = [];
  const bodyInk = snapshot.atoms.filter(a => a.table === 'body');
  for (const leader of rowLeaders(snapshot.atoms)) {
    if (leader.bleed) continue;
    // A header label whose leading columns are unlabelled aligns with its
    // own column's body ink, not the row axis. With no body ink to align to
    // (empty table), an indented header is an empty reserved track.
    if (leader.table === 'head' && leader.column > 0) {
      const peers = bodyInk.filter(a => a.column === leader.column);
      if (peers.some(a => Math.abs(a.left - leader.left) <= AXIS_TOLERANCE_PX))
        continue;
      failures.push({
        rule: 'content-axis',
        message: peers.length
          ? `column ${leader.column} header at x=${round2(leader.left)} does not align with its cells`
          : `header "${leader.text}" at x=${round2(leader.left)} sits behind an empty leading track; axis is x=${axis}`,
        offset: round2(leader.left - axis),
        example: leader.label,
      });
      continue;
    }
    const anchoredLeft =
      leader.left < column.left + column.width * LEFT_ANCHOR_SHARE;
    if (anchoredLeft) {
      if (Math.abs(leader.left - axis) > AXIS_TOLERANCE_PX)
        failures.push({
          rule: 'content-axis',
          message: `row starts at x=${round2(leader.left)}, axis is x=${axis}`,
          offset: round2(leader.left - axis),
          example: leader.label,
        });
      continue;
    }
    const rowCentre = (leader.left + leader.rowRight) / 2;
    const centred = Math.abs(rowCentre - centre) <= 1;
    const rightAnchored =
      Math.abs(leader.rowRight - rightAxis) <= AXIS_TOLERANCE_PX;
    if (!centred && !rightAnchored)
      failures.push({
        rule: 'content-axis',
        message: `row at x=${round2(leader.left)}..${round2(leader.rowRight)} is neither on the start axis, centred, nor on the end axis`,
        offset: round2(rowCentre - centre),
        example: leader.label,
      });
  }
  return failures;
}

/** Left-anchored leaders sit on whole pixels (no blurry sub-pixel edges). */
export function checkSubpixel(snapshot) {
  const { column } = snapshot;
  return rowLeaders(snapshot.atoms)
    .filter(l => !l.bleed && l.kind === 'box')
    .filter(l => l.left < column.left + column.width * LEFT_ANCHOR_SHARE)
    .filter(l => Math.abs(l.left - Math.round(l.left)) > 0.01)
    .map(l => ({
      rule: 'subpixel',
      message: `painted box starts at fractional x=${l.left}`,
      example: l.label,
    }));
}

/** Founder bans: emoji, icon tiles, plated empty states, oversized text tabs. */
export function checkBans(snapshot) {
  const failures = [];
  for (const atom of snapshot.atoms) {
    if (atom.kind === 'text' && EMOJI.test(atom.text ?? ''))
      failures.push({
        rule: 'ban-emoji',
        message: `emoji in UI text "${atom.text}"`,
        example: atom.label,
      });
  }
  for (const tile of snapshot.iconTiles ?? [])
    failures.push({
      rule: 'ban-icon-tile',
      message: `${tile.width}x${tile.height} painted plate around a lone icon`,
      example: tile.label,
    });
  for (const plate of snapshot.emptyStatePlates ?? [])
    failures.push({
      rule: 'ban-bordered-empty-card',
      message: `empty state sits on a ${plate.reason}`,
      example: plate.label,
    });
  for (const tab of snapshot.tabs ?? []) {
    if (tab.fontSize > TAB_MAX_FONT_PX || tab.height > TAB_MAX_HEIGHT_PX)
      failures.push({
        rule: 'ban-oversized-tab',
        message: `tab "${tab.text}" is ${tab.fontSize}px text in a ${tab.height}px box`,
        example: tab.label,
      });
  }
  return failures;
}

/** Nothing that is not the product: dev toolbars, framework overlays, overflow. */
export function checkCleanFrame(snapshot) {
  const failures = [];
  for (const chrome of snapshot.devChrome ?? [])
    failures.push({
      rule: 'dev-chrome',
      message: 'development chrome is visible in the frame',
      example: chrome,
    });
  if ((snapshot.horizontalOverflow ?? 0) > 0)
    failures.push({
      rule: 'horizontal-overflow',
      message: `page overflows horizontally by ${snapshot.horizontalOverflow}px`,
      example: 'document',
    });
  return failures;
}

/**
 * Pen parity: the shell rows the Pen reference declares (header, toolbar)
 * land at the same offsets and heights in code, and the code axis equals the
 * Pen inset.
 */
export function checkPenParity(snapshot, pen) {
  if (!pen)
    return [{ rule: 'pen-parity', message: 'no Pen reference', example: '' }];
  const failures = [];
  if (Math.abs(snapshot.column.width - pen.column.width) > 1)
    failures.push({
      rule: 'pen-parity',
      message: `column width ${snapshot.column.width} vs Pen ${pen.column.width}`,
      example: 'main',
    });
  const declared = (snapshot.shellRows ?? []).slice(0, 2);
  pen.rows.slice(0, 2).forEach((row, index) => {
    const code = declared[index];
    if (!code) {
      failures.push({
        rule: 'pen-parity',
        message: `Pen row "${row.name}" has no code counterpart`,
        example: row.name,
      });
      return;
    }
    if (Math.abs(code.height - row.height) > 1 || Math.abs(code.y - row.y) > 1)
      failures.push({
        rule: 'pen-parity',
        message: `row ${index} is y=${code.y} h=${code.height}; Pen "${row.name}" is y=${row.y} h=${row.height}`,
        example: code.label,
      });
  });
  return failures;
}

export function evaluateSnapshot(snapshot, pen, options = {}) {
  const failures = [
    ...checkCleanFrame(snapshot),
    ...checkContentAxis(snapshot, options),
    ...checkSubpixel(snapshot),
    ...checkBans(snapshot),
    ...(snapshot.viewport?.width >= 1024 ? checkPenParity(snapshot, pen) : []),
  ];
  return { pass: failures.length === 0, failures };
}
