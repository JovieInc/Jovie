/**
 * Repository waste inventory and ratchet (jovie-waste-sweep/v1).
 *
 * One measurement feeds three consumers:
 *   - docs/metrics/waste-latest.gen.json, which the lanes status feed embeds for
 *     Summer (scripts/lanes/doctor.py `waste` block);
 *   - the dead-code ratchet in Source Validation, which fails a PR that adds
 *     unused files, exports or dependencies (lock_down, ratchet-core);
 *   - the weekly sweep, which files the top deletion candidates as deduped
 *     Linear remediation items.
 *
 * Pure functions only; scripts/waste-sweep.mjs does the I/O.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import {
  compareRatchet,
  RATCHET_CORE_SCHEMA_VERSION,
  RATCHET_DIRECTIONS,
} from './ratchet-core.mjs';

export const WASTE_SCHEMA = 'jovie-waste-sweep/v1';

/** Issue types the dead-code ratchet locks down. Binaries are system tools. */
export const RATCHETED = Object.freeze([
  'unusedFiles',
  'unusedExports',
  'unusedTypes',
  'duplicateExports',
  'unusedDependencies',
  'unlistedDependencies',
]);

/**
 * Paths whose knip "unused file" findings are entry points knip cannot see
 * (vendored skills run by bun, design-sync build scripts run by path, docs app
 * MDX). They are still counted, but never filed as deletion candidates.
 */
export const NON_CANDIDATE_PREFIXES = Object.freeze([
  '.agents/',
  '.design-sync/',
  '.design-sync-marketing/',
  'apps/docs/',
  'apps/extension/',
  'scripts/invariants/fixtures/',
]);

const len = value =>
  Array.isArray(value)
    ? value.length
    : value && typeof value === 'object'
      ? Object.keys(value).length
      : 0;

/**
 * Summarize knip's JSON reporter output.
 * @param {{issues: Array<Record<string, any>>}} report
 * @param {(path: string) => number} sizeOf bytes of a tracked file (0 if gone)
 */
export function summarizeKnip(report, sizeOf = () => 0) {
  const counts = {
    unusedFiles: 0,
    unusedFileBytes: 0,
    unusedExports: 0,
    unusedTypes: 0,
    unusedEnumMembers: 0,
    duplicateExports: 0,
    unusedDependencies: 0,
    unlistedDependencies: 0,
    unresolvedImports: 0,
  };
  const files = [];
  const exportsByFile = [];
  const dependencies = [];
  for (const issue of report?.issues ?? []) {
    if (len(issue.files) > 0) {
      const bytes = sizeOf(issue.file);
      counts.unusedFiles += 1;
      counts.unusedFileBytes += bytes;
      files.push({ path: issue.file, bytes });
    }
    const exportCount = len(issue.exports) + len(issue.types);
    counts.unusedExports += len(issue.exports);
    counts.unusedTypes += len(issue.types);
    counts.unusedEnumMembers += len(issue.enumMembers);
    counts.duplicateExports += len(issue.duplicates);
    counts.unlistedDependencies += len(issue.unlisted);
    counts.unresolvedImports += len(issue.unresolved);
    const deps = [
      ...(issue.dependencies ?? []),
      ...(issue.devDependencies ?? []),
      ...(issue.optionalPeerDependencies ?? []),
    ];
    counts.unusedDependencies += deps.length;
    for (const dep of deps)
      dependencies.push({ workspace: issue.file, name: dep.name });
    if (exportCount > 0) {
      exportsByFile.push({
        path: issue.file,
        count: exportCount,
        names: [...(issue.exports ?? []), ...(issue.types ?? [])]
          .map(entry => entry.name)
          .slice(0, 20),
      });
    }
  }
  files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  exportsByFile.sort(
    (a, b) => b.count - a.count || a.path.localeCompare(b.path)
  );
  return { counts, files, exportsByFile, dependencies };
}

/** Issues knip reports inside the given (changed) files. */
export function issuesInFiles(report, changedFiles) {
  const changed = new Set(changedFiles);
  const hits = [];
  for (const issue of report?.issues ?? []) {
    if (!changed.has(issue.file)) continue;
    const kinds = [];
    if (len(issue.files) > 0) kinds.push('unused file');
    for (const key of ['exports', 'types', 'duplicates', 'unlisted'])
      if (len(issue[key]) > 0)
        kinds.push(
          `${key}: ${(issue[key] ?? [])
            .flat()
            .map(entry => entry.name)
            .join(', ')}`
        );
    for (const key of ['dependencies', 'devDependencies'])
      if (len(issue[key]) > 0)
        kinds.push(
          `unused ${key}: ${issue[key].map(entry => entry.name).join(', ')}`
        );
    if (kinds.length) hits.push({ path: issue.file, kinds });
  }
  return hits;
}

function frontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  return end === -1 ? null : text.slice(3, end);
}

/** `name` + `description` bytes of a skill file: what every session lists. */
export function skillListingBytes(text) {
  const fm = frontmatter(text);
  if (!fm) return 0;
  const match = /^description:\s*(\|[-+]?\s*\n(?:[ \t]+.*\n?)+|.*)$/m.exec(fm);
  const name = /^name:\s*(.*)$/m.exec(fm)?.[1] ?? '';
  const description = (match?.[1] ?? '')
    .replace(/^\|[-+]?\s*\n/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Buffer.byteLength(name) + Buffer.byteLength(description);
}

/** `paths:` globs of a scoped rule, or null when the rule always loads. */
export function rulePaths(text) {
  const fm = frontmatter(text);
  const raw = fm && /^(?:paths|globs):\s*(.*)$/m.exec(fm)?.[1];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw
      .split(',')
      .map(part => part.trim().replace(/^["'[]+|["'\]]+$/g, ''))
      .filter(Boolean);
  }
}

/** Representative edits whose loaded rule bytes we track. */
export const PROBE_EDITS = Object.freeze({
  webComponent: 'apps/web/components/features/example/Example.tsx',
  webLib: 'apps/web/lib/example/example.ts',
  workflow: '.github/workflows/example.yml',
});

/**
 * Bytes an agent pays before doing anything in this repo, plus the scoped rule
 * bytes that load for a typical edit.
 */
export function measureAgentContext(root) {
  const read = path => readFileSync(join(root, path), 'utf8');
  const bytes = path =>
    existsSync(join(root, path)) ? Buffer.byteLength(read(path)) : 0;
  const entry = {};
  const seen = new Set();
  for (const path of ['CLAUDE.md', 'AGENTS.md']) {
    if (!existsSync(join(root, path))) continue;
    const real = realpathSync(join(root, path));
    if (seen.has(real)) continue;
    seen.add(real);
    entry[path] = bytes(path);
  }
  // CLAUDE.md: "Read canon/OPERATING_SYSTEM.md first".
  entry['canon/OPERATING_SYSTEM.md'] = bytes('canon/OPERATING_SYSTEM.md');

  const skillsDir = join(root, '.claude/skills');
  let skillListing = 0;
  let skills = 0;
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      // Hosts list only <name>/SKILL.md skills; loose .md files are not listed.
      const candidates = name.endsWith('.md')
        ? []
        : [`.claude/skills/${name}/SKILL.md`];
      for (const path of candidates) {
        if (!existsSync(join(root, path))) continue;
        const listed = skillListingBytes(read(path));
        if (listed > 0) {
          skills += 1;
          skillListing += listed;
        }
      }
    }
  }

  const rulesDir = join(root, '.claude/rules');
  const rules = [];
  if (existsSync(rulesDir)) {
    for (const name of readdirSync(rulesDir).sort()) {
      if (!name.endsWith('.md')) continue;
      const path = `.claude/rules/${name}`;
      const text = read(path);
      rules.push({
        path,
        bytes: Buffer.byteLength(text),
        paths: rulePaths(text),
      });
    }
  }
  const unscopedRules = rules.filter(rule => rule.paths === null);
  const alwaysLoadedBytes =
    Object.values(entry).reduce((sum, value) => sum + value, 0) +
    skillListing +
    unscopedRules.reduce((sum, rule) => sum + rule.bytes, 0);
  const perEdit = {};
  for (const [probe, file] of Object.entries(PROBE_EDITS)) {
    perEdit[probe] = rules
      .filter(
        rule =>
          rule.paths === null ||
          rule.paths.some(glob => matchesGlob(file, glob))
      )
      .reduce((sum, rule) => sum + rule.bytes, 0);
  }
  return {
    alwaysLoadedBytes,
    entryBytes: entry,
    skills,
    skillListingBytes: skillListing,
    unscopedRules: unscopedRules.map(rule => rule.path),
    ruleBytesTotal: rules.reduce((sum, rule) => sum + rule.bytes, 0),
    ruleBytesPerEdit: perEdit,
    largestRules: [...rules]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map(({ path, bytes: size }) => ({ path, bytes: size })),
  };
}

/**
 * Packages resolved at more than one version in a pnpm v9 lockfile, and
 * direct dependencies whose specifiers diverge across workspaces.
 */
export function lockfileDuplicates(lockText) {
  const start = lockText.indexOf('\npackages:\n');
  const end = lockText.indexOf('\nsnapshots:\n');
  const section =
    start === -1 ? '' : lockText.slice(start, end === -1 ? undefined : end);
  const versions = new Map();
  for (const line of section.split('\n')) {
    const match = /^ {2}'?(@?[^@\s']+)@([^:'(]+)/.exec(line);
    if (!match) continue;
    if (!versions.has(match[1])) versions.set(match[1], new Set());
    versions.get(match[1]).add(match[2]);
  }
  const multi = [...versions]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, versions: [...set].sort() }))
    .sort(
      (a, b) =>
        b.versions.length - a.versions.length || a.name.localeCompare(b.name)
    );
  return {
    packages: versions.size,
    multiVersionPackages: multi.length,
    extraVersions: multi.reduce((sum, row) => sum + row.versions.length - 1, 0),
    top: multi.slice(0, 15),
  };
}

export function divergentDirectDependencies(manifests) {
  const specs = new Map();
  for (const [path, manifest] of Object.entries(manifests)) {
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [name, spec] of Object.entries(manifest?.[field] ?? {})) {
        if (String(spec).startsWith('workspace:')) continue;
        const normalized = String(spec).replace(/^[\^~]/, '');
        if (!specs.has(name)) specs.set(name, new Map());
        specs.get(name).set(path, normalized);
      }
    }
  }
  return [...specs]
    .filter(([, byPath]) => new Set(byPath.values()).size > 1)
    .map(([name, byPath]) => ({ name, specs: Object.fromEntries(byPath) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * CI cost and value per workflow from sampled run history.
 * rows: [{path, total, runs: [{c: conclusion, s: startedAt, u: updatedAt}]}]
 */
export function summarizeCiRuns(rows, { days = 30 } = {}) {
  const workflows = [];
  for (const row of rows) {
    const runs = row.runs ?? [];
    const by = {};
    let minutes = 0;
    for (const run of runs) {
      const key = run.c ?? 'in_progress';
      by[key] = (by[key] ?? 0) + 1;
      const duration = (Date.parse(run.u) - Date.parse(run.s)) / 60_000;
      if (Number.isFinite(duration) && duration > 0 && duration < 360)
        minutes += duration;
    }
    const total = row.total ?? runs.length;
    const scale = runs.length ? total / runs.length : 0;
    workflows.push({
      path: row.path,
      runs: total,
      sampled: runs.length,
      conclusions: by,
      wallMinutes: Math.round(minutes * scale),
    });
  }
  workflows.sort((a, b) => b.wallMinutes - a.wallMinutes);
  const decided = w =>
    (w.conclusions.success ?? 0) + (w.conclusions.failure ?? 0);
  const alwaysRed = workflows.filter(
    w =>
      w.sampled >= 20 &&
      (w.conclusions.success ?? 0) === 0 &&
      (w.conclusions.failure ?? 0) >= 0.5 * w.sampled
  );
  const mostlyCancelled = workflows.filter(
    w => w.sampled >= 20 && (w.conclusions.cancelled ?? 0) >= 0.5 * w.sampled
  );
  const neverRan = workflows.filter(w => w.runs === 0);
  const neverFailed = workflows.filter(
    w => w.sampled >= 20 && decided(w) > 0 && (w.conclusions.failure ?? 0) === 0
  );
  const minutesOf = list => list.reduce((sum, w) => sum + w.wallMinutes, 0);
  return {
    windowDays: days,
    workflows: workflows.length,
    wallMinutes: minutesOf(workflows),
    alwaysRed: alwaysRed.map(w => ({
      path: w.path,
      wallMinutes: w.wallMinutes,
    })),
    alwaysRedMinutes: minutesOf(alwaysRed),
    mostlyCancelled: mostlyCancelled.map(w => ({
      path: w.path,
      wallMinutes: w.wallMinutes,
      cancelled: w.conclusions.cancelled,
      sampled: w.sampled,
    })),
    mostlyCancelledMinutes: minutesOf(mostlyCancelled),
    neverRan: neverRan.map(w => w.path),
    neverFailed: neverFailed.map(w => ({
      path: w.path,
      wallMinutes: w.wallMinutes,
    })),
    top: workflows.slice(0, 10),
  };
}

/**
 * One number to drive down. Weights convert each dimension to "points":
 * a dead file 10, a dead export 1, an unused or unlisted dependency 25,
 * an always-loaded agent-context KiB 5, an always-red CI hour 2.
 */
export function wasteScore(metrics) {
  const k = metrics.knip ?? {};
  const always = metrics.agentContext?.alwaysLoadedBytes ?? 0;
  const redMinutes = metrics.ci?.alwaysRedMinutes ?? 0;
  return Math.round(
    (k.unusedFiles ?? 0) * 10 +
      (k.unusedExports ?? 0) +
      (k.unusedTypes ?? 0) +
      (k.duplicateExports ?? 0) +
      ((k.unusedDependencies ?? 0) + (k.unlistedDependencies ?? 0)) * 25 +
      (always / 1024) * 5 +
      (redMinutes / 60) * 2
  );
}

export function ratchetEntry(dimension, baseline) {
  return {
    schemaVersion: RATCHET_CORE_SCHEMA_VERSION,
    dimension,
    direction: RATCHET_DIRECTIONS.LOCK_DOWN,
    baseline,
    policy: { marginFraction: 0, improveEpsilon: 0, minSampleSize: 0 },
  };
}

/**
 * Compare measured knip counts to the committed lock_down baseline. A zero
 * baseline (ratchet-core requires a positive one) must stay zero.
 */
export function evaluateWasteRatchet(counts, baseline) {
  const results = [];
  for (const dimension of RATCHETED) {
    const entry = baseline?.ratchets?.[dimension];
    const measured = counts[dimension] ?? 0;
    if (!entry) {
      results.push({ dimension, ok: true, status: 'unratcheted', measured });
      continue;
    }
    if (entry.baseline === 0) {
      results.push({
        dimension,
        ok: measured === 0,
        status: measured === 0 ? 'pass' : 'regression',
        measured,
        baseline: 0,
      });
      continue;
    }
    results.push({ dimension, ...compareRatchet(measured, entry) });
  }
  return {
    ok: results.every(result => result.ok),
    regressions: results.filter(result => result.status === 'regression'),
    improvements: results.filter(result => result.status === 'improvement'),
    results,
  };
}

/** Lower every improved dimension to its measured value; never loosen. */
export function tightenBaseline(baseline, counts, now = new Date()) {
  const next = structuredClone(baseline);
  let changed = false;
  for (const dimension of RATCHETED) {
    const entry = next.ratchets?.[dimension];
    const measured = counts[dimension];
    if (!entry || typeof measured !== 'number') continue;
    if (measured < entry.baseline) {
      entry.baseline = measured;
      changed = true;
    }
  }
  if (changed) next.updatedAt = now.toISOString();
  return { changed, baseline: next };
}

/**
 * Deletion candidates for the fleet, largest first. Each carries a stable
 * fingerprint so the Linear intake dedupes across weekly runs.
 */
export function deletionCandidates(knipSummary, ci, limit = 10) {
  const candidates = [];
  for (const file of knipSummary.files) {
    if (NON_CANDIDATE_PREFIXES.some(prefix => file.path.startsWith(prefix)))
      continue;
    candidates.push({
      kind: 'unused-file',
      fingerprint: `waste-sweep:unused-file:${file.path}`,
      title: `Delete unused file ${file.path}`,
      path: file.path,
      bytes: file.bytes,
      weight: file.bytes,
    });
  }
  for (const row of knipSummary.exportsByFile.slice(0, 50)) {
    if (NON_CANDIDATE_PREFIXES.some(prefix => row.path.startsWith(prefix)))
      continue;
    candidates.push({
      kind: 'unused-exports',
      fingerprint: `waste-sweep:unused-exports:${row.path}`,
      title: `Remove ${row.count} unused exports from ${row.path}`,
      path: row.path,
      names: row.names,
      weight: row.count * 200,
    });
  }
  for (const workflow of ci?.alwaysRed ?? []) {
    candidates.push({
      kind: 'always-red-workflow',
      fingerprint: `waste-sweep:always-red:${workflow.path}`,
      title: `Fix or retire always-red workflow ${workflow.path}`,
      path: workflow.path,
      wallMinutes: workflow.wallMinutes,
      weight: workflow.wallMinutes * 100,
    });
  }
  return candidates.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

export function candidateIssueBody(candidate, runUrl) {
  const lines = [
    `The weekly waste sweep (scripts/waste-sweep.mjs) found this deletion candidate.`,
    '',
    `- Kind: \`${candidate.kind}\``,
    `- Path: \`${candidate.path}\``,
  ];
  if (candidate.bytes != null) lines.push(`- Bytes: ${candidate.bytes}`);
  if (candidate.names?.length)
    lines.push(`- Unused: ${candidate.names.map(n => `\`${n}\``).join(', ')}`);
  if (candidate.wallMinutes != null)
    lines.push(
      `- CI wall minutes in the sampled window: ${candidate.wallMinutes}`
    );
  lines.push(
    '',
    'Done when the path is deleted (or the export/workflow removed) and `node scripts/waste-sweep.mjs ratchet` passes.',
    'Before deleting a route, API route or workflow, check usage (grep, Vercel/Sentry hits). If it is still needed, add the entry point to knip.json instead and close this issue.'
  );
  if (runUrl) lines.push('', `Run: ${runUrl}`);
  return lines.join('\n');
}
