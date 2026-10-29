#!/usr/bin/env tsx
/**
 * JOV-INV-046 dead-end scanner. Every rendered control must have a working
 * path in the current runtime. Three static checks over UI source, ratcheted
 * against packages/copy/dead-ends.baseline.json (shrink-only):
 *
 *   copy   dead-end phrases in rendered strings (DEAD_END_RULES)
 *   code   no-op handlers, constant `disabled` with no reason, `href="#"`
 *   link   literal internal hrefs that resolve to no app route
 *
 *   tsx packages/copy/dead-ends.ts check            fail on anything new
 *   tsx packages/copy/dead-ends.ts update           rewrite baseline (shrinks only; --allow-grow for audits)
 *   tsx packages/copy/dead-ends.ts list             print every finding
 *
 * Escape hatch for genuine permission/entitlement prompts that lead to a
 * working path: a `dead-end-ok: <reason>` comment on the same or previous line.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCopy } from './cli';
import { DEAD_END_RULES, DEAD_END_TRANSIENT } from './rules';

export const DEAD_END_INVARIANT_ID = 'JOV-INV-046';
export const BASELINE_PATH = 'packages/copy/dead-ends.baseline.json';
export const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/hooks',
  'apps/web/lib',
  'apps/desktop/src',
  'packages/ui',
] as const;

export interface DeadEndFinding {
  readonly path: string;
  readonly kind: 'copy' | 'code' | 'link';
  readonly rule: string;
  readonly value: string;
  readonly line: number;
}

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'generated',
  'fixtures',
  'tests',
  '__tests__',
  'e2e',
  'api',
  'storybook-static',
]);
const SKIP_PATH = /^apps\/web\/app\/ui\/|\/features\/dev\//;
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;
const SOURCE_FILE = /\.(?:tsx|ts)$/;
const OPT_OUT = /dead-end-ok:\s*\S+/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (SOURCE_FILE.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// ── Copy ────────────────────────────────────────────────────────────────

/** ts files carry rendered copy only in data/copy modules; tsx always does. */
function isCopySource(path: string): boolean {
  if (path.endsWith('.tsx')) return true;
  return (
    /Copy\.ts$|copy\.ts$|messages?\.ts$|labels?\.ts$|strings?\.ts$/.test(
      path
    ) ||
    path.startsWith('apps/desktop/src/') ||
    path.startsWith('apps/web/components/') ||
    path.startsWith('apps/web/hooks/')
  );
}

// Identifier-ish string, e.g. 'unavailable' state names or error codes.
const TOKEN_ONLY = /^[A-Za-z_]+$/;

export function scanCopy(path: string, source: string): DeadEndFinding[] {
  if (!isCopySource(path)) return [];
  const findings: DeadEndFinding[] = [];
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^(?:\/\/|\*|\/\*)/.test(trimmed)) return;
    if (/^\s*(?:import|export\s+type|type)\b/.test(line)) return;
    // Logs and thrown errors are not rendered.
    if (
      /\b(?:logger|console)\.\w+\(|\bthrow\s+new\s+\w*Error|\bcaptureError|\bnew Error\(/.test(
        line
      )
    )
      return;
    if (OPT_OUT.test(line) || OPT_OUT.test(lines[index - 1] ?? '')) return;
    for (const text of extractCopy(line, path)) {
      if (TOKEN_ONLY.test(text) || DEAD_END_TRANSIENT.test(text)) continue;
      for (const rule of DEAD_END_RULES) {
        if (rule.pattern.test(text)) {
          findings.push({
            path,
            kind: 'copy',
            rule: rule.id,
            value: text.slice(0, 90),
            line: index + 1,
          });
          break;
        }
      }
    }
  });
  return findings;
}

// ── Code patterns ───────────────────────────────────────────────────────

const NOOP_BODY = String.raw`(?:\{\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*\}|undefined|null|void 0)`;
const NOOP_HANDLER = new RegExp(
  String.raw`\b(on(?:Click|Press|Select|Submit|PointerDown|Change))\s*=\s*\{\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*${NOOP_BODY}\s*\}|\b(on(?:Click|Press|Select|Submit))\s*=\s*\{\s*noop\s*\}`,
  'g'
);
const DEAD_HREF = /\bhref\s*=\s*(?:\{?\s*)['"](?:#|javascript:[^'"]*|)['"]/g;
const JSX_TAG =
  /<([A-Z][\w.]*|button|a|input|select|textarea)\b([^<>]*?(?:=>[^<>]*?)*?)(\/?)>/g;

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

export function scanCode(path: string, source: string): DeadEndFinding[] {
  if (!path.endsWith('.tsx')) return [];
  const findings: DeadEndFinding[] = [];
  const lines = source.split('\n');
  const optedOut = (line: number) =>
    OPT_OUT.test(lines[line - 1] ?? '') || OPT_OUT.test(lines[line - 2] ?? '');
  const push = (rule: string, value: string, index: number) => {
    const line = lineOf(source, index);
    if (!optedOut(line))
      findings.push({ path, kind: 'code', rule, value, line });
  };
  for (const match of source.matchAll(NOOP_HANDLER)) {
    push('noop-handler', `${match[1] ?? match[2]}=noop`, match.index ?? 0);
  }
  for (const match of source.matchAll(DEAD_HREF)) {
    push('dead-href', match[0].replace(/\s+/g, ' '), match.index ?? 0);
  }
  for (const match of source.matchAll(JSX_TAG)) {
    const attrs = match[2] ?? '';
    // Constant disabled (bare or ={true}) with no stated reason is a control
    // that can never work. Conditional `disabled={isPending}` is transient.
    const constantDisabled =
      /(?:^|\s)disabled(?=\s|$|\/)(?!\s*=)|\bdisabled\s*=\s*\{\s*true\s*\}/.test(
        attrs
      );
    const hasReason =
      /\b(?:disabledReason|title|aria-describedby|aria-busy|tooltip)\b/.test(
        attrs
      );
    if (constantDisabled && !hasReason && !/\bplaceholder\b/.test(attrs)) {
      push('disabled-no-reason', `<${match[1]} disabled>`, match.index ?? 0);
    }
  }
  return findings;
}

// ── Links ───────────────────────────────────────────────────────────────

function collectRoutes(): string[][] {
  const appDir = join(ROOT, 'apps/web/app');
  const routes: string[][] = [];
  const visit = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const name = entry.name;
        if (name.startsWith('@') || name.startsWith('_')) continue;
        const isGroup = name.startsWith('(') && name.endsWith(')');
        visit(join(dir, name), isGroup ? segments : [...segments, name]);
      } else if (/^(?:page|route)\.(?:tsx?|jsx?|mdx)$/.test(entry.name)) {
        routes.push(segments);
      }
    }
  };
  visit(appDir, []);
  return routes;
}

function collectConfigSources(): string[][] {
  const config = join(ROOT, 'apps/web/next.config.js');
  const text = existsSync(config) ? readFileSync(config, 'utf8') : '';
  const sources = new Set<string>();
  for (const match of text.matchAll(/source:\s*['"`](\/[^'"`]*)['"`]/g))
    sources.add(match[1] ?? '');
  return [...sources].map(source =>
    source
      .split('/')
      .filter(Boolean)
      .map(segment => (segment.startsWith(':') ? '[param]' : segment))
  );
}

function segmentMatches(pattern: string, segment: string): boolean {
  if (pattern.startsWith('[')) return true;
  return pattern === segment;
}

function matches(route: string[], parts: string[]): boolean {
  for (let i = 0; i < route.length; i++) {
    const pattern = route[i] ?? '';
    if (/^\[\[?\.\.\./.test(pattern)) return true;
    if (i >= parts.length) return false;
    if (!segmentMatches(pattern, parts[i] ?? '')) return false;
  }
  return route.length === parts.length;
}

export function makeResolver(
  routes: string[][],
  publicFiles: (path: string) => boolean
) {
  return (href: string): boolean => {
    const path = href.split(/[?#]/)[0] ?? '';
    const parts = path.split('/').filter(Boolean);
    if (publicFiles(path)) return true;
    return routes.some(route => matches(route, parts));
  };
}

const INTERNAL_HREF =
  /(?:\bhref\s*[=:]\s*\{?\s*|\b(?:push|replace|redirect|permanentRedirect)\(\s*)(['"])(\/[^'"\s$`{}]*)\1/g;

export function scanLinks(
  path: string,
  source: string,
  resolves: (href: string) => boolean
): DeadEndFinding[] {
  if (!path.endsWith('.tsx')) return [];
  const findings: DeadEndFinding[] = [];
  const lines = source.split('\n');
  for (const match of source.matchAll(INTERNAL_HREF)) {
    const href = match[2] ?? '';
    if (href.startsWith('//') || href === '/') continue;
    if (resolves(href)) continue;
    const line = lineOf(source, match.index ?? 0);
    if (
      OPT_OUT.test(lines[line - 1] ?? '') ||
      OPT_OUT.test(lines[line - 2] ?? '')
    )
      continue;
    findings.push({
      path,
      kind: 'link',
      rule: 'unresolved-href',
      value: href,
      line,
    });
  }
  return findings;
}

// ── Baseline ratchet ────────────────────────────────────────────────────

export type Baseline = {
  schema: 'jovie.dead-ends/v1';
  invariant: string;
  totalFindings: number;
  files: Record<string, Record<string, number>>;
};

const identityOf = (f: DeadEndFinding) => `${f.kind}:${f.rule}:${f.value}`;

export function toCounts(findings: readonly DeadEndFinding[]) {
  const files: Record<string, Record<string, number>> = {};
  for (const f of findings) {
    const file = (files[f.path] ??= {});
    const id = identityOf(f);
    file[id] = (file[id] ?? 0) + 1;
  }
  return files;
}

export function compareToBaseline(
  files: Record<string, Record<string, number>>,
  baseline: Pick<Baseline, 'files'>
) {
  const regressions: string[] = [];
  const shrinks: string[] = [];
  for (const [path, ids] of Object.entries(files)) {
    for (const [id, count] of Object.entries(ids)) {
      const allowed = baseline.files[path]?.[id] ?? 0;
      if (count > allowed)
        regressions.push(`${path}: ${id} (${allowed} allowed, ${count} found)`);
    }
  }
  for (const [path, ids] of Object.entries(baseline.files)) {
    for (const [id, allowed] of Object.entries(ids)) {
      const count = files[path]?.[id] ?? 0;
      if (count < allowed)
        shrinks.push(`${path}: ${id} ${allowed} -> ${count}`);
    }
  }
  return { regressions, shrinks };
}

export function scanAll(root = ROOT): DeadEndFinding[] {
  const routes = [...collectRoutes(), ...collectConfigSources()];
  const publicDir = join(root, 'apps/web/public');
  const resolves = makeResolver(routes, path =>
    existsSync(join(publicDir, path))
  );
  const findings: DeadEndFinding[] = [];
  for (const scanRoot of SCAN_ROOTS) {
    for (const file of walk(join(root, scanRoot))) {
      const rel = relative(root, file).split('\\').join('/');
      if (SKIP_PATH.test(rel)) continue;
      const source = readFileSync(file, 'utf8');
      findings.push(
        ...scanCopy(rel, source),
        ...scanCode(rel, source),
        ...scanLinks(rel, source, resolves)
      );
    }
  }
  return findings;
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), 'utf8'));
}

function main(argv: string[]): number {
  const [command = 'check', ...flags] = argv;
  const findings = scanAll();
  const files = toCounts(findings);
  if (command === 'list') {
    for (const f of findings)
      console.log(`${f.path}:${f.line} [${f.kind}/${f.rule}] ${f.value}`);
    console.log(`dead-ends: ${findings.length} finding(s)`);
    return 0;
  }
  if (command === 'update') {
    const previous = existsSync(join(ROOT, BASELINE_PATH))
      ? readBaseline()
      : undefined;
    if (previous && !flags.includes('--allow-grow')) {
      const { regressions } = compareToBaseline(files, previous);
      if (regressions.length) {
        console.error(
          `dead-ends: refusing to grow the baseline:\n${regressions.join('\n')}`
        );
        return 1;
      }
    }
    const baseline: Baseline = {
      schema: 'jovie.dead-ends/v1',
      invariant: DEAD_END_INVARIANT_ID,
      totalFindings: findings.length,
      files: Object.fromEntries(Object.entries(files).sort()),
    };
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      `${JSON.stringify(baseline, null, 2)}\n`
    );
    console.log(
      `dead-ends: baseline written, ${findings.length} grandfathered`
    );
    return 0;
  }
  const { regressions, shrinks } = compareToBaseline(files, readBaseline());
  for (const regression of regressions)
    console.error(`dead-end (${DEAD_END_INVARIANT_ID}): new ${regression}`);
  if (shrinks.length)
    console.log(
      `dead-ends: ${shrinks.length} grandfathered finding(s) removed; run pnpm design:no-dead-ends:update to lock the shrink`
    );
  if (regressions.length) {
    console.error(
      'dead-ends: a rendered control must work in the current runtime. Capability-gate or hide it; never explain its absence. See canon/invariants.jsonl JOV-INV-046.'
    );
    return 1;
  }
  console.log(`dead-ends: clean (${findings.length} grandfathered)`);
  return 0;
}

if (process.argv[1]?.endsWith('dead-ends.ts')) {
  process.exit(main(process.argv.slice(2)));
}
