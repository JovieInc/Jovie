import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findForbiddenTerms,
  SCOPE_FORBIDDEN_TERMS,
} from '@/data/marketing/factory/pageRecord';
import { getPageRecordContracts } from '@/data/marketing/factory/pageRecordContract';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';

/**
 * Manifest-driven marketing source invariants.
 *
 * Per-route System B style guards are opt-in and hand-written, so 18 of 40
 * marketing routes (including /card and /product) had no source guard at
 * all. This contract derives its scope from MARKETING_ROUTE_MANIFEST: every
 * route's page.tsx, every declared section/evidence component, and every
 * local module they import. A new route or component is covered the moment
 * it is registered or imported — no per-route test to remember.
 *
 * Rules are the written taste invariants (.claude/rules/ui.md, DESIGN.md,
 * docs/marketing/DESIGN_INVARIANTS.md) that can be decided from source.
 * Rendered-layout invariants (nested surfaces, stranded text, heading
 * hierarchy, clipping) live in the route DOM detector instead.
 *
 * Existing violations are a decrease-only baseline. To shrink it after a
 * fix, run with UPDATE_MARKETING_SOURCE_BASELINE=1.
 */

const WEB_ROOT = process.cwd();
const BASELINE_PATH = resolve(
  WEB_ROOT,
  'tests/unit/marketing/marketing-route-source-invariants.baseline.json'
);

/**
 * Only first-party UI/copy modules are walked; lib/ and packages are not UI.
 * content/pages/ holds factory page records, the copy source of family routes.
 */
const SCANNED_ROOTS = [
  'app/',
  'components/',
  'data/',
  'content/pages/',
] as const;
const NON_PRODUCT = /\.(test|spec|stories)\.[jt]sx?$/;

interface SourceRule {
  readonly id: string;
  readonly invariant: string;
  readonly pattern: RegExp;
  /** Copy rules also read data/ modules; class rules only read components. */
  readonly scope: 'markup' | 'copy';
}

const MARKETING_SOURCE_RULES: readonly SourceRule[] = [
  // System B source contract — the pattern set the hand-written per-route
  // guards (cli, about, pricing, …) enforce, generalized to every route.
  {
    id: 'legacy-linear-type',
    invariant:
      'System B: legacy marketing-*-linear / marketing-kicker classes are retired',
    pattern:
      /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/g,
    scope: 'markup',
  },
  {
    id: 'inline-style',
    invariant: 'System B: visuals come from named primitives, not style={}',
    pattern: /\bstyle=\{/g,
    scope: 'markup',
  },
  {
    id: 'raw-color',
    invariant: 'System B: no raw hex/rgb/hsl colors or gradients in markup',
    pattern:
      /['"`\s(]#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:linear|radial)-gradient\(/g,
    scope: 'markup',
  },
  {
    id: 'arbitrary-value',
    invariant: 'System B: no arbitrary Tailwind values; use tokens',
    pattern:
      /\b(?:bg|border|text|ring|shadow|rounded|h|w|max-w|min-h|tracking|leading|p[xytblr]?|m[xytblr]?|gap|z|top|left|right|bottom|inset)-\[/g,
    scope: 'markup',
  },
  {
    id: 'raw-palette',
    invariant: 'System B: no raw Tailwind palette colors; use semantic tokens',
    pattern:
      /\b(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|green|blue|purple|pink|yellow|lime|teal)-\d/g,
    scope: 'markup',
  },
  // Taste invariants that are decidable from source.
  {
    id: 'decorative-hover-motion',
    invariant: 'ui.md No Decorative Hover Motion: no translate/scale on hover',
    pattern: /\b(?:group-)?hover:-?(?:translate-[xy]|scale)-/g,
    scope: 'markup',
  },
  {
    id: 'negative-margin-reflow',
    invariant:
      'MKT-D06: supporting copy belongs to the composition, not pulled into place',
    pattern: /(?:^|[\s'"`])-m[ty]-\d/g,
    scope: 'markup',
  },
  {
    id: 'emoji',
    invariant: 'ui.md No Emoji in UI',
    pattern: /\p{Emoji_Presentation}/gu,
    scope: 'copy',
  },
  {
    id: 'placeholder-copy',
    invariant:
      'AGENT_GUIDE zero-proof path: never ship placeholder content as the product',
    pattern: /\blorem ipsum\b|['">]\s*Your name\s*['"<]/gi,
    scope: 'copy',
  },
];

function resolveLocalImport(fromFile: string, specifier: string) {
  let base: string;
  if (specifier.startsWith('@/')) base = join(WEB_ROOT, specifier.slice(2));
  else if (specifier.startsWith('.'))
    base = resolve(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (/\.[jt]sx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

const IMPORT_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function isScanned(file: string) {
  const rel = relative(WEB_ROOT, file);
  return (
    SCANNED_ROOTS.some(root => rel.startsWith(root)) && !NON_PRODUCT.test(rel)
  );
}

function collectRouteSources(entryFiles: readonly string[]) {
  const seen = new Set<string>();
  const queue = entryFiles.map(file => resolve(WEB_ROOT, file));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !isScanned(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const next = resolveLocalImport(file, match[1] ?? match[2]);
      if (next) queue.push(next);
    }
  }
  return [...seen].map(file => relative(WEB_ROOT, file)).sort();
}

function manifestEntryFiles() {
  const byRoute = new Map<string, string[]>();
  for (const entry of MARKETING_ROUTE_MANIFEST) {
    if (entry.status === 'removed') continue;
    const files = [`app/${entry.glob}`];
    for (const binding of entry.renderedSections) {
      if (binding.kind === 'approved-section') {
        files.push(binding.componentPath.replace(/^apps\/web\//, ''));
      }
    }
    if (entry.productEvidence) {
      files.push(
        entry.productEvidence.componentPath.replace(/^apps\/web\//, '')
      );
    }
    byRoute.set(entry.glob, files);
  }
  return byRoute;
}

const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

/**
 * Per-record copy scope (JOV-7283): a record's own source file and every
 * local copy module it imports must avoid the terms its brief forbids. A
 * founders record importing artist copy fails here even when the record's
 * own fields are clean.
 */
function findRecordScopeViolations(
  files: readonly string[],
  forbidden: readonly string[]
) {
  const hits: string[] = [];
  for (const file of files) {
    const source = readFileSync(resolve(WEB_ROOT, file), 'utf8');
    for (const match of source.matchAll(STRING_LITERAL)) {
      for (const term of findForbiddenTerms(match[2] ?? '', forbidden)) {
        hits.push(`${file}: "${term}"`);
      }
    }
  }
  return [...new Set(hits)];
}

function findViolations(files: readonly string[]) {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const source = readFileSync(resolve(WEB_ROOT, file), 'utf8');
    const isMarkup = file.endsWith('.tsx');
    for (const rule of MARKETING_SOURCE_RULES) {
      if (rule.scope === 'markup' && !isMarkup) continue;
      const hits = source.match(rule.pattern)?.length ?? 0;
      if (hits > 0) counts[`${rule.id}::${file}`] = hits;
    }
  }
  return counts;
}

function readBaseline(): Record<string, number> {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<
    string,
    number
  >;
}

describe('marketing route source invariants (manifest-driven)', () => {
  const routes = manifestEntryFiles();
  const scannedByRoute = new Map(
    [...routes].map(([glob, files]) => [glob, collectRouteSources(files)])
  );
  const allFiles = [...new Set([...scannedByRoute.values()].flat())].sort();

  it('covers every live manifest route with at least its page source', () => {
    expect(routes.size).toBeGreaterThan(0);
    for (const [glob, files] of scannedByRoute) {
      expect(files, `${glob} resolved no scanned sources`).toContain(
        `app/${glob}`
      );
    }
  });

  it('follows imports beyond the declared component paths', () => {
    const product = scannedByRoute.get('(marketing)/product/page.tsx') ?? [];
    expect(product).toContain('components/site/MarketingTerminalCta.tsx');
  });

  it('detects each rule on a known-bad sample', () => {
    const samples: Record<string, string> = {
      'legacy-linear-type': "<p className='marketing-kicker'>Soon</p>",
      'inline-style': '<div style={{ opacity: 0.5 }} />',
      'raw-color': "className='bg-black' fill='#0070f3'",
      'arbitrary-value': "className='text-[clamp(2rem,3vw,3rem)]'",
      'raw-palette': "className='text-emerald-500'",
      'decorative-hover-motion': "className='hover:-translate-y-1'",
      'negative-margin-reflow': "className='mx-auto -mt-10 px-6'",
      emoji: "label: 'Launch 🚀'",
      'placeholder-copy': '<p>Your name</p>',
    };
    for (const rule of MARKETING_SOURCE_RULES) {
      const sample = samples[rule.id];
      expect(sample, `${rule.id} needs a red sample`).toBeDefined();
      expect(sample!.match(rule.pattern), rule.id).not.toBeNull();
    }
    expect(
      "className='mt-10 hover:bg-surface-1'".match(
        /\b(?:group-)?hover:-?(?:translate-[xy]|scale)-/g
      )
    ).toBeNull();
  });

  it('holds every routed page record to its own copy scope', () => {
    const contracts = getPageRecordContracts();
    expect(contracts.length).toBeGreaterThan(0);
    for (const contract of contracts) {
      const [family, slug] = contract.recordId.split('.');
      const recordFile = `content/pages/${family}/${slug}.ts`;
      expect(existsSync(resolve(WEB_ROOT, recordFile)), recordFile).toBe(true);
      const files = collectRouteSources([recordFile]);
      expect(files, contract.recordId).toContain(recordFile);
      expect(
        findRecordScopeViolations(files, contract.forbiddenTerms),
        `${contract.recordId} (${contract.copyScope})`
      ).toEqual([]);
    }
  });

  it('fails the artists sources when held to shared scope (red sample)', () => {
    const files = collectRouteSources(['content/pages/solutions/artists.ts']);
    expect(files).toContain('data/artistProfileCopy.ts');
    expect(
      findRecordScopeViolations(files, SCOPE_FORBIDDEN_TERMS.shared)
    ).not.toEqual([]);
  });

  it('never grows, and ratchets down, the violation baseline', () => {
    const current = findViolations(allFiles);
    if (process.env.UPDATE_MARKETING_SOURCE_BASELINE === '1') {
      const sorted = Object.fromEntries(
        Object.entries(current).sort(([a], [b]) => a.localeCompare(b))
      );
      writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
      return;
    }

    const baseline = readBaseline();
    const regressions = Object.entries(current)
      .filter(([key, count]) => count > (baseline[key] ?? 0))
      .map(
        ([key, count]) =>
          `${key}: ${count} (baseline ${baseline[key] ?? 0}) — ${
            MARKETING_SOURCE_RULES.find(rule => key.startsWith(`${rule.id}::`))
              ?.invariant
          }`
      );
    const stale = Object.entries(baseline)
      .filter(([key, count]) => (current[key] ?? 0) < count)
      .map(([key, count]) => `${key}: ${current[key] ?? 0} < ${count}`);

    expect(regressions, 'New marketing invariant violations').toEqual([]);
    expect(
      stale,
      'Baseline is stale — rerun with UPDATE_MARKETING_SOURCE_BASELINE=1 to lock in the fix'
    ).toEqual([]);
  });
});
