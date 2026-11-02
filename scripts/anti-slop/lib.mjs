/**
 * Anti-slop registry library. The registry (docs/design-system/anti-slop-rules.json)
 * is the one canonical list; this module validates it, proves every "enforced"
 * rule is really wired, and detects prose copies that drifted away from it.
 */
import { execFileSync } from 'node:child_process';
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

/**
 * A wiring entry is proven only by what runs: a ci-fast lane whose command
 * names the check (commandIncludes), or a non-comment line of the file. A
 * bare token in a comment or an unrelated lane does not count.
 */
export function wiringProblem(wire, root) {
  const file = join(root, wire.file);
  if (!existsSync(file)) return `${wire.file} missing`;
  const text = readFileSync(file, 'utf8');
  if (wire.commandIncludes) {
    const start = text.indexOf(wire.token);
    if (start < 0) return `${wire.file} lacks ${JSON.stringify(wire.token)}`;
    const end = text.indexOf('Object.freeze(', start);
    const block = text.slice(start, end < 0 ? undefined : end);
    return block.includes(wire.commandIncludes)
      ? null
      : `lane ${wire.token} does not run ${JSON.stringify(wire.commandIncludes)}`;
  }
  const live = text
    .split('\n')
    .some(
      line => line.includes(wire.token) && !/^\s*(?:#|\/\/|\*)/u.test(line)
    );
  return live
    ? null
    : `${wire.file} has no live line with ${JSON.stringify(wire.token)}`;
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
      const problem = wiringProblem(wire, root);
      if (problem) errors.push(`${at}: not wired: ${problem}`);
    }
    for (const matcher of enf.matchers ?? []) {
      try {
        if (/g/u.test(matcher.flags ?? ''))
          errors.push(`${at}: matcher flags must not include g`);
        const re = new RegExp(matcher.pattern, matcher.flags ?? 'iu');
        const fixtures = matcher.fixtures ?? {};
        if (!fixtures.fail?.length || !fixtures.pass?.length)
          errors.push(`${at}: matcher needs fixtures.fail and fixtures.pass`);
        for (const line of fixtures.fail ?? [])
          if (!re.test(line))
            errors.push(
              `${at}: matcher misses its own fail fixture ${JSON.stringify(line)}`
            );
        for (const line of fixtures.pass ?? [])
          if (re.test(line))
            errors.push(
              `${at}: matcher flags its own pass fixture ${JSON.stringify(line)}`
            );
      } catch (error) {
        errors.push(`${at}: matcher does not compile: ${error.message}`);
      }
    }
    if (
      enf.status === 'enforced' &&
      enf.kind.includes('vision') &&
      !['shadow', 'blocking'].includes(enf.visionStatus)
    ) {
      errors.push(
        `${at}: enforced rule with a vision part needs visionStatus shadow|blocking`
      );
    }
  }
  for (const judge of reg.judges ?? []) {
    if (!ids.has(judge.rule))
      errors.push(`judge ${judge.id}: unknown rule ${judge.rule}`);
  }
  return { errors, ids };
}

/** Vendored changelogs and SKILL.md files generated from a sibling .tmpl are not authored prose. */
function isGenerated(root, rel) {
  if (rel.endsWith('/CHANGELOG.md')) return true;
  return rel.endsWith('/SKILL.md') && existsSync(join(root, `${rel}.tmpl`));
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
    } else if (/\.(?:md|mdx|tmpl|txt)$/u.test(rel) && !isGenerated(root, rel)) {
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
  for (const file of trackedProseFiles(root)) {
    for (const cited of new Set(
      readFileSync(join(root, file), 'utf8').match(/\bASR-\d{3}\b/gu) ?? []
    )) {
      if (!ids.has(cited)) errors.push(`${file}: cites unknown ${cited}`);
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

/** ASR-040: bounded generic heading words, preserving names such as Jovie and Apple Music. */
export const TITLE_CASE_HEADING =
  /\btitle=['"][^'"\n]*\s(?:Settings|Panel|Player|Tasks|Dock|Update|Timeline|Search|Results|View|Bottom|Chat|Links|Stats|Rules|Accounts|Tools|Tracking|Privacy)\b/u;
export function findTitleCaseHeadings(root = REPO_ROOT) {
  const files = execFileSync('git', ['ls-files', '--', 'apps/web'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const hits = [];
  for (const file of files) {
    if (!/\.tsx$/u.test(file) || /\.(?:test|spec|stories)\./u.test(file))
      continue;
    if (!/^apps\/web\/(?:app\/.*\/settings\/|components\/shell\/)/u.test(file))
      continue;
    for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
      if (TITLE_CASE_HEADING.test(line)) hits.push(`${file}: ${line.trim()}`);
    }
  }
  return hits.sort();
}

export function checkTitleCaseHeadings(root = REPO_ROOT) {
  const legacy = JSON.parse(readFileSync(join(root, LEGACY_PATH), 'utf8'));
  const current = findTitleCaseHeadings(root);
  const remaining = [...(legacy.titleCaseHeadings ?? [])];
  const errors = [];
  for (const hit of current) {
    const index = remaining.indexOf(hit);
    if (index < 0) errors.push(`ASR-040: use sentence case: ${hit}`);
    else remaining.splice(index, 1);
  }
  for (const hit of remaining)
    errors.push(`ASR-040: remove stale baseline: ${hit}`);
  return errors;
}
