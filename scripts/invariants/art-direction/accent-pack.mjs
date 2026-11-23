/**
 * Accent pack gate. Enforces the contract in .claude/rules/ui.md ("Accent
 * pack") across apps/web, packages/ui and apps/ovie:
 * off-pack color, two-tone gradients, rotation order and adjacency, one accent
 * per item, green and red minimum set, equal weight, no solid container fills.
 *
 * Extends the art-direction runner (run.mjs loads every check here) and also
 * runs from `pnpm invariants:check`. Pre-existing violations live in
 * accent-pack.baseline.json: new ids fail, resolved ids pass and are
 * dropped by --tighten. Rules (d), (e), (f) and
 * (g) are heuristics; see accent-pack-lib.mjs.
 *
 *   node scripts/invariants/art-direction/accent-pack.mjs            check
 *   node scripts/invariants/art-direction/accent-pack.mjs --tighten  drop resolved ids (never adds)
 *   node scripts/invariants/art-direction/accent-pack.mjs --update   rewrite baseline from the live scan
 *   node scripts/invariants/art-direction/accent-pack.mjs --report   counts by rule and area
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXTRA_PACK_HEX,
  SCAN_ROOTS,
  SKIP_PATH,
  TOKEN_SOURCE_FILES,
} from './accent-pack-config.mjs';
import { scanSource } from './accent-pack-lib.mjs';
import { REPO_ROOT, relPath, walkFiles } from './paths.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';

export const ACCENT_PACK_BASELINE =
  'scripts/invariants/art-direction/accent-pack.baseline.json';

function packHexes(repoRoot) {
  const hexes = new Set(EXTRA_PACK_HEX);
  try {
    const sot = JSON.parse(
      readFileSync(
        join(repoRoot, 'apps/web/design/ziawi-color-sot.json'),
        'utf8'
      )
    );
    for (const hex of Object.values(sot.accents.hex))
      hexes.add(hex.toLowerCase());
  } catch {
    // The source of truth is optional for the scanner; tests pass hexes in.
  }
  try {
    const css = readFileSync(
      join(repoRoot, 'apps/web/styles/design-system.css'),
      'utf8'
    );
    for (const m of css.matchAll(
      /--(?:color-accent|noir-ion)-[a-z0-9-]+:\s*(#[0-9a-fA-F]{6})\b/g
    ))
      hexes.add(m[1].toLowerCase());
  } catch {
    // ignore
  }
  return [...hexes];
}

export function scanAccentPack(repoRoot = REPO_ROOT) {
  const allowedHex = packHexes(repoRoot);
  /** @type {string[]} */
  const ids = [];
  const files = walkFiles(repoRoot, SCAN_ROOTS, {
    exts: new Set(['.ts', '.tsx', '.css']),
  });
  for (const file of files) {
    const rel = relPath(repoRoot, file);
    if (SKIP_PATH.test(rel) || rel.endsWith('.d.ts')) continue;
    const source = readFileSync(file, 'utf8');
    ids.push(
      ...scanSource(source, rel, {
        allowedHex,
        tokenSource: TOKEN_SOURCE_FILES.includes(rel),
      })
    );
  }
  return [...new Set(ids)].sort();
}

export const ruleOf = id => id.slice(0, id.indexOf(':'));
export const areaOf = id => {
  const file = id.split(':')[1];
  const parts = file.split('/');
  if (parts[0] === 'apps' && parts[1] === 'web')
    return parts.slice(0, 4).join('/');
  return parts.slice(0, 3).join('/');
};

export const check = checkAccentPack;

export function checkAccentPack(repoRoot = REPO_ROOT, recordedIds) {
  const current = scanAccentPack(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, ACCENT_PACK_BASELINE), 'utf8')).ids;
  const ancestor = ancestorJson(repoRoot, ACCENT_PACK_BASELINE);
  if (!ancestor.ok)
    return { failures: [ancestor.error], ids: current, stale: [] };
  // Combine-safe (scripts/lib/queue-drift-guards.json): growth fails, a
  // shrink passes. A resolved id is stale headroom reported as a notice and
  // removed later by --tighten, so two green PRs never have to rewrite this
  // file to stay green together.
  const live = new Set(current);
  const stale = recorded.filter(id => !live.has(id));
  return {
    failures: evaluateRatchet({
      current,
      recorded: recorded.filter(id => live.has(id)),
      ancestor: ancestor.ancestor?.ids ?? null,
    }),
    ids: current,
    stale,
  };
}

/** The recorded ids that are still live. Never adds an id. */
export function tightenedIds(recorded, current) {
  const live = new Set(current);
  return recorded.filter(id => live.has(id));
}

/* ---------------------------------------------------------------- inventory */

/**
 * Surfaces, most specific first.
 * @type {ReadonlyArray<readonly [string, RegExp]>}
 */
export const SURFACES = Object.freeze([
  [
    'Homepage',
    /^apps\/web\/(app\/\(home\)|components\/(homepage|features\/(home|landing))\/)/,
  ],
  [
    'Onboarding and waitlist',
    /^apps\/web\/(app\/(onboarding|waitlist)|components\/(onboarding|features\/(onboarding|waitlist))|lib\/onboarding)/,
  ],
  [
    'Ovie and admin',
    /^apps\/ovie\/|^apps\/web\/(app\/app\/\(shell\)\/admin|components\/features\/admin)/,
  ],
  [
    'Public artist profiles',
    /^apps\/web\/(app\/\[username\]|components\/features\/profile|lib\/profile|app\/\(profile-admission\))/,
  ],
  [
    'Marketing site (ICP, solutions, pricing)',
    /^apps\/web\/(app\/\(marketing\)|components\/(marketing|site)|components\/features\/pricing)/,
  ],
  [
    'App shell and dashboard',
    /^apps\/web\/(app\/app\/|components\/(shell|jovie)|components\/features\/(dashboard|settings|release|library|chat|workspace))/,
  ],
  [
    'Experiments and dev tools',
    /^apps\/web\/(app\/(exp|dev|sandbox|ui|hud)|components\/features\/dev|lib\/design-studio)/,
  ],
  [
    'Shared UI (atoms, molecules, organisms, packages/ui)',
    /^(apps\/web\/components\/(atoms|molecules|organisms|ui)|packages\/ui)/,
  ],
]);
export const surfaceOf = file =>
  SURFACES.find(([, re]) => re.test(file))?.[0] ?? 'Other (lib, shared, misc)';

/**
 * Worst first: filled blocks, two-tone gradients, multi-accent, green/red decor, then the rest.
 * @type {ReadonlyArray<readonly [string, string[], number]>}
 */
export const SEVERITY = Object.freeze([
  ['Filled accent blocks', ['solid-accent-fill'], 8],
  ['Two-tone gradients', ['two-tone-gradient'], 5],
  [
    'Multiple accents in one item or section',
    ['multi-accent-item', 'multi-accent-file'],
    3,
  ],
  [
    'Decorative green or red outside status or 6+ series',
    ['mint-red-min-set', 'mint-red-unguarded', 'rotation-helper-no-threshold'],
    2,
  ],
  [
    'Rotation order, adjacency and unequal weight',
    ['rotation-order', 'adjacent-accent', 'unequal-weight'],
    1,
  ],
  [
    'Off-pack color',
    ['off-pack-tailwind', 'off-pack-literal', 'off-pack-var'],
    0.25,
  ],
]);

function needleFor(id) {
  const [rule, , ...rest] = id.split(':');
  const tail = rest.join(':');
  switch (rule) {
    case 'off-pack-tailwind':
    case 'off-pack-var':
    case 'off-pack-literal':
      return tail.replace(/_/g, '[_ ]');
    case 'two-tone-gradient':
      return 'gradient|from-|via-|to-\\[|to-[a-z]+-\\d';
    case 'solid-accent-fill':
      return 'bg-|background';
    case 'multi-accent-item':
    case 'multi-accent-file':
      return 'bg-|data-accent|background';
    case 'mint-red-min-set':
    case 'mint-red-unguarded':
      return 'mint|green|red|teal';
    case 'rotation-helper-no-threshold':
      return tail;
    default:
      return tail.split(':')[0].split(' ')[0] || 'accent';
  }
}

export function lineOf(repoRoot, id) {
  const file = id.split(':')[1];
  let text;
  try {
    text = readFileSync(join(repoRoot, file), 'utf8');
  } catch {
    return 1;
  }
  let re;
  try {
    re = new RegExp(
      needleFor(id)
        .replace(/[()]/g, m => '\\' + m)
        .replace(/\\\\/g, '\\')
    );
  } catch {
    return 1;
  }
  const lines = text.split('\n');
  const hit = lines.findIndex(l => re.test(l));
  return hit === -1 ? 1 : hit + 1;
}

export function buildInventory(
  repoRoot = REPO_ROOT,
  ids = scanAccentPack(repoRoot)
) {
  const rows = ids.map(id => ({
    id,
    rule: ruleOf(id),
    file: id.split(':')[1],
    surface: surfaceOf(id.split(':')[1]),
  }));
  const groupOf = rule => SEVERITY.findIndex(([, rs]) => rs.includes(rule));
  const weight = rule => SEVERITY[groupOf(rule)]?.[2] ?? 0;
  const surfaces = [...SURFACES.map(([n]) => n), 'Other (lib, shared, misc)'];
  const out = [];
  out.push(
    '# Accent pack sweep',
    '',
    `Total violations: ${rows.length}. Generated by \`node scripts/invariants/art-direction/accent-pack.mjs --inventory\`. Rules (d) to (g) are heuristics; read each id as a lead to review, not a verdict.`,
    ''
  );
  out.push(
    '## Counts by kind (worst first)',
    '',
    '| Kind | Rules | Count |',
    '|---|---|---|'
  );
  for (const [name, rs] of SEVERITY)
    out.push(
      `| ${name} | ${rs.join(', ')} | ${rows.filter(r => rs.includes(r.rule)).length} |`
    );
  out.push(
    '',
    '## Counts by surface and kind',
    '',
    `| Surface | ${SEVERITY.map(s => s[0]).join(' | ')} | Total |`,
    `|---|${SEVERITY.map(() => '---').join('|')}|---|`
  );
  for (const surface of surfaces) {
    const mine = rows.filter(r => r.surface === surface);
    out.push(
      `| ${surface} | ${SEVERITY.map(([, rs]) => mine.filter(r => rs.includes(r.rule)).length).join(' | ')} | ${mine.length} |`
    );
  }
  const byFile = new Map();
  for (const r of rows) {
    const e = byFile.get(r.file) ?? { score: 0, rows: [] };
    e.score += weight(r.rule);
    e.rows.push(r);
    byFile.set(r.file, e);
  }
  const top = [...byFile.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, 15);
  out.push(
    '',
    '## Top 15 offenders (weighted: fill 8, two-tone 5, multi-accent 3, green/red 2, order 1, off-pack 0.25)',
    '',
    '| # | file:line | surface | worst kind | violations |',
    '|---|---|---|---|---|'
  );
  top.forEach(([file, e], i) => {
    const worst = e.rows
      .slice()
      .sort((a, b) => weight(b.rule) - weight(a.rule))[0];
    out.push(
      `| ${i + 1} | ${file}:${lineOf(repoRoot, worst.id)} | ${surfaceOf(file)} | ${worst.rule} | ${e.rows.length} |`
    );
  });
  out.push('', '## Ranked list, worst kind first, by surface', '');
  for (const [name, rs] of SEVERITY) {
    const hits = rows.filter(r => rs.includes(r.rule));
    out.push(`### ${name} (${hits.length})`, '');
    for (const surface of surfaces) {
      const mine = hits.filter(r => r.surface === surface);
      if (!mine.length) continue;
      out.push(`**${surface}** (${mine.length})`, '');
      const cap = name === 'Off-pack color' ? 8 : 40;
      for (const r of mine.slice(0, cap))
        out.push(
          `- ${r.file}:${lineOf(repoRoot, r.id)} ${r.id.split(':').slice(2).join(':')}`
        );
      if (mine.length > cap)
        out.push(
          `- ... ${mine.length - cap} more (see accent-pack.baseline.json)`
        );
      out.push('');
    }
  }
  return out.join('\n');
}

function tally(ids, keyFn) {
  const map = new Map();
  for (const id of ids) map.set(keyFn(id), (map.get(keyFn(id)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const invArg = process.argv.find(a => a.startsWith('--inventory'));
  if (invArg) {
    const target = invArg.split('=')[1];
    const md = buildInventory();
    if (target) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, md + '\n');
    } else process.stdout.write(md + '\n');
  } else if (process.argv.includes('--report')) {
    const ids = scanAccentPack();
    const out = {
      total: ids.length,
      byRule: tally(ids, ruleOf),
      byArea: tally(ids, areaOf),
      byFile: tally(ids, id => id.split(':')[1]).slice(0, 15),
    };
    process.stdout.write(JSON.stringify(out, null, 1) + '\n');
  } else if (process.argv.includes('--tighten')) {
    const path = join(REPO_ROOT, ACCENT_PACK_BASELINE);
    const recorded = JSON.parse(readFileSync(path, 'utf8')).ids;
    const ids = tightenedIds(recorded, scanAccentPack());
    writeFileSync(
      path,
      JSON.stringify(
        { schema: 'jovie.art-direction-accent-pack/v1', ids },
        null,
        2
      ) + '\n'
    );
    process.stdout.write(
      `accent-pack: baseline tightened (${recorded.length - ids.length} resolved id(s) dropped, ${ids.length} left)\n`
    );
  } else if (process.argv.includes('--update')) {
    const ids = scanAccentPack();
    writeFileSync(
      join(REPO_ROOT, ACCENT_PACK_BASELINE),
      JSON.stringify(
        { schema: 'jovie.art-direction-accent-pack/v1', ids },
        null,
        2
      ) + '\n'
    );
    process.stdout.write(`accent-pack: baseline written (${ids.length} ids)\n`);
  } else {
    const { failures, ids, stale } = checkAccentPack();
    if (failures.length) {
      process.stderr.write(`accent-pack:\n${failures.join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`accent-pack: ok (${ids.length} baselined)\n`);
      if (stale.length)
        process.stdout.write(
          `accent-pack: ${stale.length} resolved id(s) still listed; this passes. Run --tighten to drop them.\n`
        );
    }
  }
}
