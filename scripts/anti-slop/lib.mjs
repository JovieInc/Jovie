/**
 * Anti-slop registry library. The registry (docs/design-system/anti-slop-rules.json)
 * is the one canonical list; this module validates it, proves every "enforced"
 * rule is really wired, and detects prose copies that drifted away from it.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const REGISTRY_PATH = 'docs/design-system/anti-slop-rules.json';
export const LEGACY_PATH = 'scripts/anti-slop/legacy-copies.json';
const ID = /^ASR-\d{3}$/u;
/** Phrases that mark a prose copy of the anti-slop list. */
export const SIGNATURES = Object.freeze([
  /decorative blobs/iu,
  /icon-in-circle/iu,
  /purple-blue gradient/iu,
  /ai slop blacklist/iu,
  /generic (?:saas )?card grids?/iu,
]);
/** Where prose copies are looked for. Files that cite an ASR id are fine. */
export const PROSE_GLOBS = Object.freeze([
  '.claude/skills',
  '.claude/rules',
  '.agents/skills',
  'docs',
  'canon',
  'CLAUDE.md',
  'AGENTS.md',
]);

export function loadRegistry(root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(root, REGISTRY_PATH), 'utf8'));
}

export function validateRegistry(reg, root = REPO_ROOT) {
  const errors = [];
  const ids = new Set();
  if (reg.schema !== 'jovie.anti-slop-rules/v1')
    errors.push('schema must be jovie.anti-slop-rules/v1');
  for (const rule of reg.rules ?? []) {
    const at = rule.id ?? '(no id)';
    if (!ID.test(rule.id ?? '')) errors.push(`${at}: id must match ASR-nnn`);
    if (ids.has(rule.id)) errors.push(`${at}: duplicate id`);
    ids.add(rule.id);
    for (const key of ['title', 'statement', 'rationale']) {
      if (typeof rule[key] !== 'string' || rule[key].length < 8)
        errors.push(`${at}: ${key} required`);
    }
    if (
      !rule.source?.by ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(rule.source?.date ?? '') ||
      !rule.source?.ref
    ) {
      errors.push(`${at}: source needs by, date (YYYY-MM-DD) and ref`);
    }
    if (
      !Array.isArray(rule.scope) ||
      rule.scope.length === 0 ||
      rule.scope.some(s => !reg.scopeValues.includes(s))
    ) {
      errors.push(`${at}: scope must be a non-empty subset of scopeValues`);
    }
    if (!['block', 'warn'].includes(rule.severity))
      errors.push(`${at}: severity must be block or warn`);
    const enf = rule.enforcement ?? {};
    if (!reg.kindValues.includes(enf.kind))
      errors.push(`${at}: enforcement.kind invalid`);
    if (!reg.statusValues.includes(enf.status))
      errors.push(`${at}: enforcement.status invalid`);
    if (!enf.check) errors.push(`${at}: enforcement.check required`);
    if (enf.status === 'enforced') {
      if (!enf.kind.startsWith('static'))
        errors.push(`${at}: enforced rules must have a static part`);
      if (!enf.evidence?.length)
        errors.push(`${at}: enforced rule needs evidence paths`);
      if (!enf.wiredIn?.length)
        errors.push(`${at}: enforced rule needs wiredIn {file, token}`);
    }
    for (const path of enf.evidence ?? []) {
      if (!existsSync(join(root, path)))
        errors.push(`${at}: evidence missing: ${path}`);
    }
    for (const wire of enf.wiredIn ?? []) {
      const file = join(root, wire.file);
      if (
        !existsSync(file) ||
        !readFileSync(file, 'utf8').includes(wire.token)
      ) {
        errors.push(
          `${at}: not wired: ${wire.file} lacks ${JSON.stringify(wire.token)}`
        );
      }
    }
  }
  for (const judge of reg.judges ?? []) {
    if (!ids.has(judge.rule))
      errors.push(`judge ${judge.id}: unknown rule ${judge.rule}`);
  }
  return { errors, ids };
}

function trackedProseFiles(root) {
  const out = [];
  const walk = rel => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    const stat = lstatSync(abs);
    if (stat.isDirectory()) {
      for (const name of readdirSync(abs)) {
        if (name !== 'node_modules' && name !== '.git') walk(`${rel}/${name}`);
      }
    } else if (/\.(?:md|mdx|tmpl|txt)$/u.test(rel)) {
      out.push(rel);
    }
  };
  for (const entry of PROSE_GLOBS) walk(entry);
  return out;
}

/** Files that carry a prose copy of the anti-slop list without citing a rule id. */
export function findUnregisteredCopies(root = REPO_ROOT) {
  const hits = [];
  for (const file of trackedProseFiles(root)) {
    const text = readFileSync(join(root, file), 'utf8');
    if (!SIGNATURES.some(sig => sig.test(text))) continue;
    if (/\bASR-\d{3}\b/u.test(text)) continue;
    hits.push(file);
  }
  return hits.sort();
}

/** Mirrors must cite every id they claim; unknown ids fail. Legacy copies may only shrink. */
export function checkDrift(reg, root = REPO_ROOT) {
  const errors = [];
  const ids = new Set(reg.rules.map(r => r.id));
  for (const mirror of reg.mirrors ?? []) {
    const file = join(root, mirror.path);
    if (!existsSync(file)) {
      errors.push(`mirror missing: ${mirror.path}`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    for (const id of mirror.ids) {
      if (!ids.has(id)) errors.push(`mirror ${mirror.path}: unknown ${id}`);
      else if (!text.includes(id))
        errors.push(`mirror ${mirror.path}: does not cite ${id}`);
    }
    for (const cited of text.match(/\bASR-\d{3}\b/gu) ?? []) {
      if (!ids.has(cited))
        errors.push(`mirror ${mirror.path}: cites unknown ${cited}`);
    }
  }
  const legacy = JSON.parse(readFileSync(join(root, LEGACY_PATH), 'utf8'));
  const current = findUnregisteredCopies(root);
  const allowed = new Set(legacy.files);
  for (const file of current) {
    if (!allowed.has(file))
      errors.push(
        `new prose copy of the anti-slop list in ${file}: cite the ASR id instead of copying text`
      );
  }
  const stale = legacy.files.filter(f => !current.includes(f));
  if (stale.length)
    errors.push(
      `legacy-copies.json lists files no longer copying (remove them, the ratchet only shrinks): ${stale.join(', ')}`
    );
  return { errors, current };
}

export function summarize(reg) {
  const by = {};
  for (const r of reg.rules) {
    const key = `${r.enforcement.status}/${r.enforcement.kind}`;
    by[key] = (by[key] ?? 0) + 1;
  }
  return by;
}
