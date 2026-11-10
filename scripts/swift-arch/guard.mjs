#!/usr/bin/env node
/**
 * Swift architecture ratchet (ADR: docs/architecture/swift-architecture-adr-2026-10-29.md).
 *
 * Counts architecture-debt identities (rule + file) across production Swift,
 * compares them with the committed baseline, and fails when any count grows
 * or a new file gains a violation. Debt can only shrink: a count below the
 * baseline also fails until the baseline is tightened with --write-baseline,
 * so every improvement is locked in by the PR that made it.
 *
 * Filesystem + regex only (no Xcode), so it runs in the cheap Linux ci-fast
 * iOS lane instead of the Mac pool. Portable: the config travels with the
 * baseline, so another repo vendors this file plus its own baseline.
 *
 *   node scripts/swift-arch/guard.mjs                  check against baseline
 *   node scripts/swift-arch/guard.mjs --list           print every violation
 *   node scripts/swift-arch/guard.mjs --json [--out f] metrics (violation counts)
 *   node scripts/swift-arch/guard.mjs --write-baseline tighten (never loosen)
 *   node scripts/swift-arch/guard.mjs --init-baseline  first adoption only (empty baseline)
 *   --baseline <path>                                  alternate baseline/config
 *
 * Main-actor detection is a deliberate heuristic: a scope is main-actor when
 * its type or function is `@MainActor`, a SwiftUI View/App/Scene, a UIKit
 * view/controller, or an extension of a type found to be main-actor anywhere
 * in the scanned roots. `actor`, `nonisolated`, `Task.detached`, and
 * non-main dispatch queues open off-main scopes. `#if DEBUG` blocks and test
 * targets are skipped.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
/** Nearest ancestor holding `.git`, so the vendored copy works at any depth. */
function findRepoRoot(start) {
  let dir = start;
  while (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir);
    if (parent === dir) return resolve(start, '..', '..');
    dir = parent;
  }
  return dir;
}
export const DEFAULT_REPO_ROOT = findRepoRoot(THIS_DIR);
const SELF = relative(DEFAULT_REPO_ROOT, fileURLToPath(import.meta.url));
export const DEFAULT_BASELINE = join(THIS_DIR, 'baseline.json');
export const METRICS_SCHEMA = 'jovie.swift-arch-metrics/v1';
export const ADR_PATH =
  'docs/architecture/swift-architecture-adr-2026-10-29.md';

/**
 * Rules. `scope: 'main'` rules only count lines inside a main-actor scope;
 * `scope: 'any'` rules count everywhere in production Swift.
 */
export const RULES = Object.freeze([
  {
    id: 'observable-object-type',
    scope: 'any',
    pattern:
      /\b(?:class)\s+\w+[^{]*?[:,]\s*(?:[\w.]+\s*,\s*)*ObservableObject\b/,
    fix: 'Use the Observation framework: `@MainActor @Observable final class`. ObservableObject re-renders every observer on any @Published change.',
  },
  {
    id: 'combine-observation-wrapper',
    scope: 'any',
    pattern: /@(?:StateObject|ObservedObject|EnvironmentObject|Published)\b/,
    fix: 'With @Observable models use @State (owner), a plain `let`/@Bindable (child), or @Environment(Type.self). Views then track only the properties their body reads.',
  },
  {
    id: 'main-actor-json-codec',
    scope: 'main',
    pattern:
      /\bJSON(?:De|En)coder\(\)|\.(?:decode|encode)\([^)]*(?:from:|\.self)|JSONSerialization\./,
    fix: 'Decode/encode in the nonisolated networking layer or a cache actor and hand the main actor a finished value type.',
  },
  {
    id: 'main-actor-sync-io',
    scope: 'main',
    pattern:
      /FileManager\.default|\.write\(to:|String\(contentsOf|contentsOfFile:|\bFileHandle\(/,
    fix: 'Move file I/O into an actor or nonisolated async function; the main actor only receives the result.',
  },
  {
    id: 'main-actor-image-decode',
    scope: 'main',
    pattern:
      /\b(?:UI|NS|CI)Image\((?:data|contentsOf)|byPreparingThumbnail|preparingThumbnail\(|CGImageSourceCreate|\.jpegData\(|\.pngData\(/,
    fix: 'Decode and downsample off the main actor (nonisolated async / Task.detached) and cache the bitmap (NSCache); seed view state from the cache.',
  },
  {
    id: 'main-actor-keychain',
    scope: 'main',
    pattern: /\bSecItem(?:CopyMatching|Add|Update|Delete)\b/,
    fix: 'Keychain calls are IPC to securityd. Read once off-main and serve an in-memory value; never call SecItem* from main-actor code.',
  },
  {
    id: 'main-actor-core-data',
    scope: 'any',
    // Direct calls, plus binding the main-queue context for later fetch/save
    // work (`let context = viewContext`), which is how most call sites reach it.
    pattern:
      /\bviewContext\.(?:fetch|count|performAndWait|save|execute)\b|\bviewContext\.perform\s*\{|\blet\s+\w+\s*=\s*(?:[\w.]+\.)?viewContext\s*(?:$|[;}])/,
    fix: 'Read and write on a background context (performBackgroundTask / newBackgroundContext) and publish value snapshots; viewContext is main-queue.',
  },
  {
    id: 'per-call-formatter-or-regex',
    scope: 'any',
    pattern:
      /\b(?:DateFormatter|NumberFormatter|ISO8601DateFormatter|RelativeDateTimeFormatter|DateComponentsFormatter|MeasurementFormatter|ByteCountFormatter)\(\)|\bNSRegularExpression\(/,
    fix: 'Formatters and regexes are expensive to build. Hoist to a `static let` (or use FormatStyle: `.formatted(...)`) instead of allocating per call or per render.',
  },
  {
    id: 'gcd-main-hop',
    scope: 'any',
    pattern: /\bDispatchQueue\.main\.async(?:After)?\b/,
    fix: 'Use structured concurrency: mark the callee @MainActor or `await MainActor.run {}`; GCD hops bypass actor checking.',
  },
  {
    id: 'polling-timer',
    scope: 'any',
    pattern:
      /\bTimer\.(?:scheduledTimer|publish)\b|\bwhile\s+!Task\.isCancelled\b/,
    fix: 'Prefer push (AsyncStream, observation, notifications, server stream). If a poll is required, make it a cancellable `.task` with backoff and document why.',
  },
]);

const RULE_IDS = new Set(RULES.map(rule => rule.id));
export const PROJECT_RULE_ID = 'strict-concurrency-not-complete';

const TEST_PATH =
  /(?:Tests?\.swift$|UITests|\/Tests\/|Tests\/|Preview(?:s|Content)\/)/;

function walkSwift(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (
      name.startsWith('.') ||
      name === 'build' ||
      name === 'DerivedData' ||
      name === 'Vendor' ||
      name === 'Pods'
    )
      continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) walkSwift(full, out);
    else if (name.endsWith('.swift')) out.push(full);
  }
  return out;
}

/** Strip string literals and line comments so braces/patterns in them are ignored. */
export function stripLine(line, state) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', i);
      if (end === -1) return out;
      state.inBlockComment = false;
      i = end + 2;
      continue;
    }
    if (state.inMultilineString) {
      const end = line.indexOf('"""', i);
      if (end === -1) return out;
      state.inMultilineString = false;
      out += '""';
      i = end + 3;
      continue;
    }
    const ch = line[i];
    if (ch === '/' && line[i + 1] === '/') break;
    if (ch === '/' && line[i + 1] === '*') {
      state.inBlockComment = true;
      i += 2;
      continue;
    }
    if (line.startsWith('"""', i)) {
      state.inMultilineString = true;
      i += 3;
      continue;
    }
    if (ch === '"') {
      // Keep the literal's shape ("") but drop its contents; patterns in user
      // strings must not count, but `contentsOf:` arguments are code.
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\') j += 1;
        j += 1;
      }
      out += '""';
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const MAIN_TYPE_CONFORMANCE =
  /[:,]\s*(?:SwiftUI\.)?(?:View|App|Scene|UIViewRepresentable|UIViewControllerRepresentable|NSViewRepresentable|UIView|UIViewController|UITableViewController|UICollectionViewController|UIApplicationDelegate|UIWindowSceneDelegate|NSApplicationDelegate|NSViewController|NSView|PreviewProvider)\b/;
const TYPE_DECL =
  /\b(class|struct|enum|actor|extension|protocol)\s+([A-Za-z_][\w.]*)/;
const FUNC_DECL =
  /\b(?:func\s+\w+|init[?!]?\s*\(|deinit\b|(?:var|let)\s+\w+[^=]*\{)/;
const OFF_MAIN_CLOSURE =
  /\bTask\.detached\b|DispatchQueue\.global\(|\b\w*[qQ]ueue\.(?:async|sync)\b(?<!main\.async)|\.performBackgroundTask\b|\bnonisolated\b/;

/** First pass: names of types that are main-actor anywhere in the roots. */
export function collectMainActorTypes(sources) {
  const names = new Set();
  for (const text of sources) {
    const lines = text.split('\n');
    let pendingMain = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (/^@MainActor\b/.test(line) && !TYPE_DECL.test(line)) {
        pendingMain = true;
        continue;
      }
      const decl = line.match(TYPE_DECL);
      if (decl && decl[1] !== 'extension' && decl[1] !== 'protocol') {
        const isMain =
          decl[1] !== 'actor' &&
          (pendingMain ||
            /@MainActor\b/.test(line) ||
            MAIN_TYPE_CONFORMANCE.test(line));
        if (isMain) names.add(decl[2]);
      }
      if (line && !line.startsWith('@')) pendingMain = false;
    }
  }
  return names;
}

/**
 * Scan one file. Returns [{ rule, line, text }].
 */
export function scanSwiftSource(
  text,
  { mainActorTypes = new Set(), extraMainActorCalls = [] } = {}
) {
  const findings = [];
  const lines = text.split('\n');
  const state = { inBlockComment: false, inMultilineString: false };
  const scopes = []; // { depth, main }
  let depth = 0;
  let pendingAttrMain = false;
  let pendingScope = null; // { main, ttl }
  const ifStack = []; // true when the branch is skipped (DEBUG)
  const extraPatterns = extraMainActorCalls.map(source => new RegExp(source));

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();

    // Preprocessor: skip `#if DEBUG` blocks (and their #elseif/#else stay live).
    if (/^#if\b/.test(trimmed)) {
      ifStack.push(/^#if\s+DEBUG\b/.test(trimmed));
      continue;
    }
    if (/^#(?:elseif|else)\b/.test(trimmed)) {
      if (ifStack.length) ifStack[ifStack.length - 1] = false;
      continue;
    }
    if (/^#endif\b/.test(trimmed)) {
      ifStack.pop();
      continue;
    }
    const skipped = ifStack.some(Boolean);

    const code = stripLine(raw, state);
    const codeTrim = code.trim();
    if (!codeTrim) continue;

    const enclosingMain = scopes.length
      ? scopes[scopes.length - 1].main
      : false;

    // Attribute-only line (`@MainActor`) applies to the next declaration.
    if (
      /^@MainActor\b/.test(codeTrim) &&
      !TYPE_DECL.test(codeTrim) &&
      !FUNC_DECL.test(codeTrim)
    ) {
      pendingAttrMain = true;
    }

    const typeDecl = codeTrim.match(TYPE_DECL);
    const funcDecl = !typeDecl && FUNC_DECL.test(codeTrim);
    if (typeDecl) {
      const [, kind, name] = typeDecl;
      let main;
      if (kind === 'actor')
        main = /@MainActor\b/.test(codeTrim) || pendingAttrMain;
      else if (/\bnonisolated\b/.test(codeTrim)) main = false;
      else
        main =
          pendingAttrMain ||
          /@MainActor\b/.test(codeTrim) ||
          MAIN_TYPE_CONFORMANCE.test(codeTrim) ||
          // Nested types do not inherit the outer global actor; extensions
          // inherit the extended type's isolation.
          mainActorTypes.has(name);
      pendingScope = { main, ttl: 6 };
      pendingAttrMain = false;
    } else if (funcDecl) {
      let main = enclosingMain;
      if (/\bnonisolated\b/.test(codeTrim)) main = false;
      if (pendingAttrMain || /@MainActor\b/.test(codeTrim)) main = true;
      pendingScope = { main, ttl: 6 };
      pendingAttrMain = false;
    } else if (OFF_MAIN_CLOSURE.test(codeTrim)) {
      pendingScope = { main: false, ttl: 1 };
    } else if (
      /\bMainActor\.run\b|\bTask\s*(?:\(priority:[^)]*\))?\s*\{\s*@MainActor/.test(
        codeTrim
      )
    ) {
      pendingScope = { main: true, ttl: 1 };
    }

    const lineMain = (() => {
      // A one-line body (`func f() { ... }`) evaluates with its own scope.
      if (pendingScope && code.includes('{')) return pendingScope.main;
      return enclosingMain;
    })();

    if (!skipped) {
      for (const rule of RULES) {
        if (rule.scope === 'main' && !lineMain) continue;
        if (!rule.pattern.test(code)) continue;
        if (
          rule.id === 'per-call-formatter-or-regex' &&
          isHoistedInitializer(lines, index, code)
        )
          continue;
        findings.push({ rule: rule.id, line: index + 1, text: trimmed });
      }
      if (lineMain && extraPatterns.some(pattern => pattern.test(code))) {
        findings.push({
          rule: 'main-actor-blocking-call',
          line: index + 1,
          text: trimmed,
        });
      }
    }

    // Brace accounting.
    for (const ch of code) {
      if (ch === '{') {
        depth += 1;
        if (pendingScope) {
          scopes.push({ depth, main: pendingScope.main });
          pendingScope = null;
        }
      } else if (ch === '}') {
        while (scopes.length && scopes[scopes.length - 1].depth >= depth)
          scopes.pop();
        depth = Math.max(0, depth - 1);
      }
    }
    if (pendingScope) {
      pendingScope.ttl -= 1;
      if (pendingScope.ttl <= 0) pendingScope = null;
    }
    if (!codeTrim.startsWith('@')) pendingAttrMain = false;
  }
  return findings;
}

/** `static let f: DateFormatter = { let f = DateFormatter() ... }()` is fine. */
function isHoistedInitializer(lines, index, code) {
  if (/\b(?:static|lazy)\s+(?:let|var)\b/.test(code)) return true;
  for (let back = index - 1; back >= Math.max(0, index - 3); back -= 1) {
    const prior = lines[back];
    if (/\b(?:static|lazy)\s+(?:let|var)\b[^=]*=\s*\{\s*$/.test(prior))
      return true;
    if (/^\s*$/.test(prior)) continue;
    if (!/^\s*(?:let|var)\s+\w+\s*=/.test(prior) && !/\{\s*$/.test(prior))
      break;
  }
  return false;
}

/** Project-level: build configs / packages not at complete strict concurrency. */
export function scanProjectSettings(repoRoot, projects = []) {
  const findings = [];
  for (const relativePath of projects) {
    const full = join(repoRoot, relativePath);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    if (relativePath.endsWith('project.pbxproj')) {
      const blocks = text.match(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g) ?? [];
      for (const block of blocks) {
        if (!/SWIFT_VERSION\s*=/.test(block)) continue;
        const swift6 = /SWIFT_VERSION\s*=\s*"?6/.test(block);
        const complete = /SWIFT_STRICT_CONCURRENCY\s*=\s*complete/.test(block);
        if (!swift6 && !complete)
          findings.push({
            rule: PROJECT_RULE_ID,
            line: 0,
            text: 'build configuration below complete',
          });
      }
    } else if (relativePath.endsWith('Package.swift')) {
      const tools = text.match(/swift-tools-version:\s*(\d+)/);
      const v6Tools = tools && Number(tools[1]) >= 6;
      const v5Mode =
        /swiftLanguageModes:\s*\[[^\]]*\.v5/.test(text) ||
        /swiftLanguageVersions:\s*\[[^\]]*\.v5/.test(text);
      const strictFlag = /StrictConcurrency(?:=complete)?/.test(text);
      if ((!v6Tools || v5Mode) && !strictFlag)
        findings.push({
          rule: PROJECT_RULE_ID,
          line: 0,
          text: 'package below Swift 6 / complete',
        });
    }
  }
  return findings;
}

export function loadBaseline(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function scanRepository(repoRoot, config) {
  const files = [];
  for (const root of config.roots ?? []) walkSwift(join(repoRoot, root), files);
  const production = files.filter(
    file => !TEST_PATH.test(relative(repoRoot, file))
  );
  const sources = production.map(file => readFileSync(file, 'utf8'));
  const mainActorTypes = collectMainActorTypes(sources);
  const identities = {}; // rule -> file -> [{line,text}]
  const add = (rule, file, finding) => {
    identities[rule] ??= {};
    identities[rule][file] ??= [];
    identities[rule][file].push(finding);
  };
  production.forEach((file, index) => {
    const rel = relative(repoRoot, file);
    for (const finding of scanSwiftSource(sources[index], {
      mainActorTypes,
      extraMainActorCalls: config.extraMainActorCalls ?? [],
    })) {
      add(finding.rule, rel, finding);
    }
  });
  for (const project of config.projects ?? []) {
    for (const finding of scanProjectSettings(repoRoot, [project]))
      add(finding.rule, project, finding);
  }
  return { identities, fileCount: production.length };
}

export function countsOf(identities) {
  const counts = {};
  for (const [rule, files] of Object.entries(identities)) {
    for (const [file, findings] of Object.entries(files)) {
      counts[rule] ??= {};
      counts[rule][file] = findings.length;
    }
  }
  return counts;
}

export function compare(current, baseline) {
  const increases = [];
  const decreases = [];
  const rules = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const rule of rules) {
    const files = new Set([
      ...Object.keys(current[rule] ?? {}),
      ...Object.keys(baseline[rule] ?? {}),
    ]);
    for (const file of files) {
      const now = current[rule]?.[file] ?? 0;
      const was = baseline[rule]?.[file] ?? 0;
      if (now > was) increases.push({ rule, file, now, was });
      else if (now < was) decreases.push({ rule, file, now, was });
    }
  }
  return { increases, decreases };
}

export function totals(counts) {
  /** @type {Record<string, number>} */
  const byRule = {};
  let total = 0;
  for (const [rule, files] of Object.entries(counts)) {
    byRule[rule] = Object.values(files).reduce((sum, value) => sum + value, 0);
    total += byRule[rule];
  }
  return { total, byRule };
}

export function tightenedBaseline(current, baseline) {
  const next = {};
  for (const [rule, files] of Object.entries(baseline)) {
    for (const [file, was] of Object.entries(files)) {
      const now = current[rule]?.[file] ?? 0;
      const value = Math.min(now, was);
      if (value > 0) {
        next[rule] ??= {};
        next[rule][file] = value;
      }
    }
  }
  return sortCounts(next);
}

function sortCounts(counts) {
  const sorted = {};
  for (const rule of Object.keys(counts).sort()) {
    sorted[rule] = {};
    for (const file of Object.keys(counts[rule]).sort())
      sorted[rule][file] = counts[rule][file];
  }
  return sorted;
}

function fixFor(ruleId) {
  if (ruleId === PROJECT_RULE_ID)
    return 'New Swift modules use Swift 6 language mode (or SWIFT_STRICT_CONCURRENCY = complete). Existing debt may only shrink.';
  if (ruleId === 'main-actor-blocking-call')
    return 'This call is configured as blocking (extraMainActorCalls). Call it off the main actor or use its cached/async variant.';
  return RULES.find(rule => rule.id === ruleId)?.fix ?? '';
}

export function buildMetrics({
  baselineFile,
  current,
  fileCount,
  now = new Date(),
}) {
  const summary = totals(current);
  return {
    schema: METRICS_SCHEMA,
    generatedAt: now.toISOString(),
    repo: baselineFile.config.repo ?? null,
    filesScanned: fileCount,
    total: summary.total,
    baselineTotal: totals(baselineFile.counts ?? {}).total,
    byRule: summary.byRule,
    topFiles: Object.entries(current)
      .flatMap(([rule, files]) =>
        Object.entries(files).map(([file, count]) => ({ rule, file, count }))
      )
      .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
      .slice(0, 50),
  };
}

/** Scan the repository and return the metrics record (remediation sweep). */
export function collectSwiftArchMetrics({
  repoRoot = DEFAULT_REPO_ROOT,
  baselinePath = DEFAULT_BASELINE,
} = {}) {
  const baselineFile = loadBaseline(baselinePath);
  const { identities, fileCount } = scanRepository(
    repoRoot,
    baselineFile.config
  );
  return buildMetrics({
    baselineFile,
    current: countsOf(identities),
    fileCount,
  });
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

export function main(
  argv = process.argv.slice(2),
  { log = console.log, error = console.error } = {}
) {
  const baselinePath = resolve(
    argument(argv, '--baseline') ?? DEFAULT_BASELINE
  );
  const repoRoot = resolve(argument(argv, '--repo') ?? DEFAULT_REPO_ROOT);
  const baselineFile = loadBaseline(baselinePath);
  const { identities, fileCount } = scanRepository(
    repoRoot,
    baselineFile.config
  );
  const current = countsOf(identities);
  const baseline = baselineFile.counts ?? {};
  const summary = totals(current);

  if (argv.includes('--json')) {
    const metrics = buildMetrics({ baselineFile, current, fileCount });
    const out = argument(argv, '--out');
    const text = `${JSON.stringify(metrics, null, 2)}\n`;
    if (out) {
      mkdirSync(dirname(resolve(out)), { recursive: true });
      writeFileSync(resolve(out), text);
    } else log(text.trimEnd());
    return 0;
  }

  if (argv.includes('--list')) {
    for (const [rule, files] of Object.entries(identities)) {
      for (const [file, findings] of Object.entries(files)) {
        for (const finding of findings)
          log(`${file}:${finding.line} [${rule}] ${finding.text}`);
      }
    }
    log(
      `\nswift-arch: ${summary.total} violation(s) in ${fileCount} file(s) scanned`
    );
    return 0;
  }

  const { increases, decreases } = compare(current, baseline);

  if (argv.includes('--init-baseline')) {
    // First adoption only (a repo vendoring the guard): record today's debt.
    if (Object.keys(baseline).length > 0) {
      error(
        'swift-arch: baseline already initialized; use --write-baseline (it only shrinks).'
      );
      return 1;
    }
    const next = { ...baselineFile, counts: sortCounts(current) };
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    log(`swift-arch: baseline initialized with ${summary.total} violation(s).`);
    return 0;
  }

  if (argv.includes('--write-baseline')) {
    if (increases.length) {
      error('swift-arch: refusing to write a baseline that grows debt:');
      for (const item of increases)
        error(`  ${item.file} [${item.rule}] ${item.was} -> ${item.now}`);
      return 1;
    }
    const next = {
      ...baselineFile,
      counts: tightenedBaseline(current, baseline),
    };
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    log(
      `swift-arch: baseline tightened (${totals(baseline).total} -> ${totals(next.counts).total}).`
    );
    return 0;
  }

  const annotate = process.env.GITHUB_ACTIONS === 'true';
  if (increases.length) {
    error(
      `swift-arch: ${increases.length} new architecture violation(s). See ${baselineFile.config.adr ?? ADR_PATH}.`
    );
    for (const item of increases) {
      error(`\n  ${item.file} [${item.rule}] ${item.was} -> ${item.now}`);
      error(`    fix: ${fixFor(item.rule)}`);
      for (const finding of identities[item.rule]?.[item.file] ?? []) {
        error(`    ${item.file}:${finding.line}  ${finding.text}`);
        if (annotate && finding.line > 0) {
          error(
            `::error file=${item.file},line=${finding.line}::[swift-arch ${item.rule}] ${fixFor(item.rule)}`
          );
        }
      }
    }
    error(
      '\nThe baseline only shrinks. Fix the new code; do not raise the baseline.'
    );
    return 1;
  }
  if (decreases.length) {
    error(
      `swift-arch: debt went down, lock it in. Run: node ${SELF} --write-baseline`
    );
    for (const item of decreases)
      error(`  ${item.file} [${item.rule}] ${item.was} -> ${item.now}`);
    return 1;
  }
  log(
    `swift-arch: ${summary.total} baselined violation(s), none new (${fileCount} files).`
  );
  for (const [rule, count] of Object.entries(summary.byRule).sort(
    (a, b) => b[1] - a[1]
  ))
    log(`  ${rule}: ${count}`);
  return 0;
}

export { RULE_IDS };

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
