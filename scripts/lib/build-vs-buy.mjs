/**
 * Build-vs-buy and prior-art enforcement (canon/BUILD_VS_BUY.md).
 *
 * Pure and diff-scoped: it reads only the PR body, labels and file patches that
 * Fleet Rules already holds, plus canon/build-vs-buy.json. No network, no LLM.
 * `pr-fleet-rules.mjs` calls `evaluateBuildVsBuy`; `pnpm preflight:changed`
 * reuses the same function through lintPrBody so agents see it before CI does.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = resolve(here, '../../canon/build-vs-buy.json');
export const loadConfig = (path = CONFIG_PATH) =>
  JSON.parse(readFileSync(path, 'utf8'));

const meaningful = value =>
  typeof value === 'string' &&
  value.trim().length > 2 &&
  !/^(?:todo|tbd|n\/?a|none|not applicable|\.\.\.|<[^>]*>)\s*[.!]?$/i.test(
    value.trim()
  );
const fieldOf = (body, label) =>
  body
    .match(new RegExp(`^\\s*(?:-\\s*)?${label}:\\s*(.+)$`, 'im'))?.[1]
    ?.trim() ?? '';
const regexes = list => list.map(pattern => new RegExp(pattern));

const isManifest = path => /(?:^|\/)package\.json$/.test(path);
const extension = path => path.match(/\.([a-z]+)$/)?.[1] ?? '';

/** Hand-written, shipped source: not tests, fixtures, generated files or docs. */
export function isMaintainedSource(path, config) {
  return (
    config.codeExtensions.includes(extension(path)) &&
    !regexes(config.excludePaths).some(re => re.test(path))
  );
}

/** Where a maintained file's lines are counted: up to four path segments deep. */
export function domainOf(path) {
  const dirs = path.split('/').slice(0, -1);
  return dirs.slice(0, 4).join('/') || '.';
}

const patchLines = (file, sign) =>
  (file.patch ?? '')
    .split('\n')
    .filter(line => line.startsWith(sign) && !line.startsWith(sign.repeat(3)))
    .map(line => line.slice(1));

const DEPENDENCY_LINE =
  /^\s*"((?:@[\w.-]+\/)?[\w.-]+)":\s*"((?:[\^~<>=]*\s*\d|workspace:|catalog:|npm:|github:|git[+:]|https?:|\*|latest)[^"]*)"\s*,?\s*$/;

/** Packages a PR adds to a manifest (a version bump of an existing key is not an add). */
export function addedDependencies(files, config) {
  const ignored = new Set(config.ignoredManifestKeys);
  const found = new Map();
  for (const file of files.filter(f => isManifest(f.filename))) {
    const removed = new Set(
      patchLines(file, '-')
        .map(line => DEPENDENCY_LINE.exec(line)?.[1])
        .filter(Boolean)
    );
    for (const line of patchLines(file, '+')) {
      const match = DEPENDENCY_LINE.exec(line);
      if (!match || ignored.has(match[1]) || removed.has(match[1])) continue;
      // Workspace-internal packages are our own code, not a third-party add.
      if (match[2].startsWith('workspace:')) continue;
      found.set(match[1], { name: match[1], manifest: file.filename });
    }
  }
  return [...found.values()];
}

/** Hand-written lines added per domain by brand-new maintained files. */
export function newModuleLines(files, config) {
  const byDomain = new Map();
  for (const file of files) {
    if (file.status !== 'added' || !isMaintainedSource(file.filename, config))
      continue;
    const domain = domainOf(file.filename);
    byDomain.set(
      domain,
      (byDomain.get(domain) ?? 0) +
        (file.additions ?? patchLines(file, '+').length)
    );
  }
  return [...byDomain].map(([domain, lines]) => ({ domain, lines }));
}

/** Added lines that redefine a capability an approved package already provides. */
export function reinventions(files, config) {
  const rules = config.reinventions.map(rule => ({
    ...rule,
    re: new RegExp(rule.pattern),
    skip: regexes(rule.skipPaths ?? []),
  }));
  const hits = [];
  for (const file of files) {
    if (!isMaintainedSource(file.filename, config)) continue;
    if (!/^(?:ts|tsx|js|jsx|mjs|cjs)$/.test(extension(file.filename))) continue;
    const lines = patchLines(file, '+');
    lines.forEach((line, index) => {
      if (
        line.includes(config.waiverMarker) ||
        lines[index - 1]?.includes(config.waiverMarker)
      )
        return;
      for (const rule of rules) {
        if (rule.skip.some(re => re.test(file.filename))) continue;
        if (rule.re.test(line))
          hits.push({
            rule: rule.id,
            file: file.filename,
            approved: rule.approved,
            hint: rule.hint,
          });
      }
    });
  }
  return hits;
}

/** True when the PR introduces or rewrites an algorithmic core. */
export function algorithmCore(files, labels, config) {
  if (labels.some(label => config.algorithm.labels.includes(label)))
    return ['label'];
  const path = new RegExp(config.algorithm.pathPattern);
  return files
    .filter(file => {
      if (!isMaintainedSource(file.filename, config)) return false;
      if (!path.test(file.filename)) return false;
      if (file.status === 'added') return true;
      return (
        (file.additions ?? 0) + (file.deletions ?? 0) >=
        config.algorithm.rewriteChangedLines
      );
    })
    .map(file => file.filename);
}

let cachedConfig;
/**
 * @param {{ body: string, labels: string[], files: object[], section: Function, config?: object }} input
 * `body` has comments stripped; `section(body, heading)` is Fleet Rules' parser.
 */
export function evaluateBuildVsBuy({
  body,
  labels,
  files,
  section,
  config = (cachedConfig ??=
    loadConfig()),
}) {
  const errors = [];
  const warnings = [];
  const lowered = labels.map(label => label.toLowerCase());

  const dependencies = addedDependencies(files, config);
  const modules = newModuleLines(files, config).filter(
    entry => entry.lines >= config.newModuleLineThreshold
  );
  const decision = section(body, 'Build-vs-buy');

  if (dependencies.length) {
    const names = dependencies.map(dep => dep.name);
    const package_ = fieldOf(decision, 'Package');
    const missing = [];
    if (
      !names.every(name => package_.toLowerCase().includes(name.toLowerCase()))
    )
      missing.push(`"- Package:" naming ${names.join(', ')}`);
    if (!/\d/.test(fieldOf(decision, 'Size')))
      missing.push('"- Size:" (unpacked KB or lines)');
    if (!/\d/.test(fieldOf(decision, 'Transitive')))
      missing.push('"- Transitive:" (count of packages it pulls in)');
    if (!meaningful(fieldOf(decision, 'Maintenance')))
      missing.push(
        '"- Maintenance:" (last release, open CVEs, maintainers, license)'
      );
    if (fieldOf(decision, 'Why').length < 20)
      missing.push('"- Why:" (why not a few lines or an existing dependency)');
    if (missing.length)
      errors.push(
        `build-vs-buy: this PR adds ${names.join(', ')} (${dependencies
          .map(dep => dep.manifest)
          .filter((m, i, all) => all.indexOf(m) === i)
          .join(', ')}); the "## Build-vs-buy" section is ${
          decision.trim() ? 'incomplete' : 'missing'
        }: add ${missing.join('; ')}. Run \`node scripts/build-vs-buy-facts.mjs <package>\` for a paste-ready block; rubric: canon/BUILD_VS_BUY.md.`
      );
  }

  if (modules.length) {
    const missing = [];
    if (!meaningful(fieldOf(decision, 'Considered')))
      missing.push(
        '"- Considered:" (packages and platform features you checked)'
      );
    if (fieldOf(decision, 'Why').length < 20)
      missing.push('"- Why:" (why none covers it, or why it is our moat)');
    if (missing.length)
      errors.push(
        `build-vs-buy: this PR adds ${modules
          .map(entry => `${entry.lines} hand-written lines in ${entry.domain}`)
          .join(
            ', '
          )} (threshold ${config.newModuleLineThreshold}); the "## Build-vs-buy" section is ${
          decision.trim() ? 'incomplete' : 'missing'
        }: add ${missing.join('; ')}. Rubric: canon/BUILD_VS_BUY.md.`
      );
  }

  for (const hit of reinventions(files, config))
    errors.push(
      `reinvention: ${hit.file} adds ${hit.rule} code; use ${hit.approved}: ${hit.hint} If this truly differs, add "// ${config.waiverMarker} <reason>" on or above the line.`
    );

  const cores = algorithmCore(files, lowered, config);
  if (cores.length) {
    const prior = section(body, 'Prior art');
    const missing = [];
    if (!/https:\/\/[^\s<>)]+/.test(prior))
      missing.push(
        'at least one https link (paper, post or open-source implementation)'
      );
    if (
      !/^research\/[\w./-]+$/i.test(
        fieldOf(prior, 'Research').replace(/`/g, '')
      )
    )
      missing.push(
        '"- Research: research/<slug>" (the gbrain page that cites the prior art)'
      );
    if (fieldOf(prior, 'Comparison').length < 20)
      missing.push(
        '"- Comparison:" (our design vs the prior art: what we kept, what we changed, why)'
      );
    if (!meaningful(fieldOf(prior, 'Benchmark')))
      missing.push(
        '"- Benchmark:" (test or benchmark that holds ours against the prior art)'
      );
    if (missing.length)
      errors.push(
        `prior-art: this PR ${
          cores[0] === 'label'
            ? 'is labeled type: algorithm'
            : `introduces or rewrites an algorithmic core (${cores.slice(0, 3).join(', ')})`
        }; the "## Prior art" section is ${
          prior.trim() ? 'incomplete' : 'missing'
        }: add ${missing.join('; ')}. Order: research prior art, write our own design, compare, harden. Rubric: canon/BUILD_VS_BUY.md.`
      );
  }

  return { errors, warnings };
}

/** Paste-ready section skeletons, used by preflight:changed. */
export const BUILD_VS_BUY_TEMPLATE = [
  '## Build-vs-buy',
  '',
  '- Package: <name@version>',
  '- Size: <unpacked KB or lines>',
  '- Transitive: <count of packages it pulls in>',
  '- Maintenance: <last release, open CVEs, maintainers, license>',
  '- Considered: <packages and platform features checked (new hand-written modules)>',
  '- Why: <why not a few lines, an existing dependency, or a platform feature>',
].join('\n');
export const PRIOR_ART_TEMPLATE = [
  '## Prior art',
  '',
  '- Links: <https://paper-post-or-oss-implementation>',
  '- Research: research/<slug>',
  '- Comparison: <our design vs prior art: kept, changed, why>',
  '- Benchmark: <test or benchmark holding ours against the prior art>',
].join('\n');
