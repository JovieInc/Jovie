/**
 * Per-component design-system certificate (jovie.component-certificate/v1).
 *
 * One machine-checkable record per shippable component: which criteria pass,
 * which fail, which are not measured yet, and exactly what is missing. This is
 * the persistent whole-tree ledger; `pnpm component-ship-gate` stays the
 * per-diff blocker. Fail-closed: a criterion with no evidence is `unknown`
 * and counts as missing. Pure functions + injected evidence, so tests are
 * hermetic (no git, gh, network).
 */
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { moduleKey } from './mutation-sweep.mjs';

export const CERT_SCHEMA = 'jovie.component-certificate/v1';
export const REPORT_SCHEMA = 'jovie.component-certificate-report/v1';

export const CRITERIA = Object.freeze([
  'ds-owner',
  'tokens',
  'states',
  'tests',
  'a11y',
  'frontend-rules',
  'mutation',
  'visual',
  'journeys',
  'benchmark',
]);

export const STATES = Object.freeze([
  'loading',
  'empty',
  'error',
  'partial',
  'long-content',
  'offline',
  'permission-denied',
  'rtl-overflow',
]);

const STATE_STORY_RE = {
  loading: /^(loading|pending|skeleton)/i,
  empty: /^(empty|noData|zero)/i,
  error: /^(error|failed|failure)/i,
  partial: /^(partial|incomplete|sparse|missing)/i,
  'long-content': /^(long|overflow|many)/i,
  offline: /^(offline|disconnected)/i,
  'permission-denied':
    /^(permission|denied|restricted|forbidden|locked|gated|readOnly)/i,
  'rtl-overflow': /^(rtl|rightToLeft|arabic|hebrew)/i,
};

export const DEFAULT_POLICY = Object.freeze({
  mutationMin: 80,
  benchmarkLibraryVersion: 1,
});

const sha = text => createHash('sha256').update(text).digest('hex');
const gitBlob = text =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest('hex');

const RAW_COLOR_PATTERNS = [
  [
    /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    'tailwind-palette',
  ],
  [
    /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)(?:\/\d+)?\b/g,
    'raw-white-black',
  ],
  [/#[0-9a-fA-F]{3,8}\b/g, 'hex'],
  [/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g, 'color-function'],
  [/\[(?:#|rgb|hsl|oklch)[^\]]*\]/g, 'arbitrary-color'],
];

export function parseSource(source, fileName = 'x.tsx') {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

function stringLiterals(sf) {
  const out = [];
  const visit = n => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
      out.push(n.text);
    else if (
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    )
      out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function findRawColors(source, fileName) {
  const hits = [];
  for (const text of stringLiterals(parseSource(source, fileName))) {
    if (/^(use client|use server)$/.test(text) || /^[./@]/.test(text)) continue;
    for (const [re, kind] of RAW_COLOR_PATTERNS) {
      for (const m of text.matchAll(re)) hits.push({ kind, value: m[0] });
    }
  }
  return hits;
}

const RAW_ELEMENTS = ['button', 'input', 'select', 'textarea', 'dialog'];

export function findRawElements(source, fileName) {
  const sf = parseSource(source, fileName);
  const hits = [];
  const visit = n => {
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      ts.isIdentifier(n.tagName) &&
      RAW_ELEMENTS.includes(n.tagName.text)
    )
      hits.push(n.tagName.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/** Deterministic subset of the frontend-skill jank rules (layout shift, focus loss, input lag). */
export function findJank(source, fileName) {
  const sf = parseSource(source, fileName);
  const findings = [];
  const add = (rule, node, detail) =>
    findings.push({
      rule,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      detail,
    });
  const isComponentName = name => /^[A-Z]/.test(name ?? '');
  const returnsJsx = fn => {
    let found = false;
    const v = n => {
      if (
        ts.isJsxElement(n) ||
        ts.isJsxSelfClosingElement(n) ||
        ts.isJsxFragment(n)
      )
        found = true;
      if (!found) ts.forEachChild(n, v);
    };
    v(fn.body ?? fn);
    return found;
  };
  const fnName = n => {
    if (ts.isFunctionDeclaration(n)) return n.name?.text;
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) ||
        ts.isFunctionExpression(n.initializer))
    )
      return n.name.text;
    return undefined;
  };
  const visit = (n, depth) => {
    const name = fnName(n);
    const fn = ts.isVariableDeclaration(n) ? n.initializer : n;
    if (name && isComponentName(name) && fn && fn.body && returnsJsx(fn)) {
      if (depth > 0)
        add(
          'focus-loss:inline-component',
          n,
          `${name} is declared inside another component; it remounts every render and drops focus and typed text`
        );
      ts.forEachChild(n, c => visit(c, depth + 1));
      return;
    }
    if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name)) {
      if (n.name.text === 'autoFocus')
        add(
          'focus-loss:autofocus',
          n,
          'autoFocus steals focus on mount; move focus on an explicit user action'
        );
      if (
        n.name.text === 'key' &&
        n.initializer &&
        /Math\.random|Date\.now|randomUUID|uuid\(/.test(
          n.initializer.getText(sf)
        )
      )
        add(
          'focus-loss:unstable-key',
          n,
          'unstable key remounts the subtree every render'
        );
      if (
        n.name.text === 'onChange' &&
        n.initializer &&
        /\b(router\.(push|replace)|fetch\(|await\b)/.test(
          n.initializer.getText(sf)
        )
      )
        add(
          'input-lag:sync-work-in-onchange',
          n,
          'network or navigation inside onChange without debounce or transition'
        );
    }
    if (
      (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
      ts.isIdentifier(n.tagName) &&
      n.tagName.text === 'img'
    ) {
      const attrs = new Set(
        n.attributes.properties
          .filter(ts.isJsxAttribute)
          .map(a => (ts.isIdentifier(a.name) ? a.name.text : ''))
      );
      if (
        !(attrs.has('width') && attrs.has('height')) &&
        !/aspect-/.test(n.attributes.getText(sf))
      )
        add(
          'layout-shift:img-no-dimensions',
          n,
          '<img> without width/height or an aspect-* box reserves no space'
        );
    }
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'useEffect' &&
      n.arguments.length >= 2
    ) {
      const [cb, deps] = n.arguments;
      const body = cb.getText(sf);
      const depsText = deps.getText(sf);
      if (
        /\b(reset|clear)[A-Za-z]*\(|set[A-Z]\w*\((?:''|""|null|\[\]|\{\})\)/.test(
          body
        ) &&
        /\b(open|isOpen|visible|show|shown|expanded)\b/i.test(depsText)
      ) {
        add(
          'input-reset:effect-resets-on-open-state',
          n,
          'effect resets form state when an open/visible dependency changes; typed input can be wiped by a re-render or Escape'
        );
      }
    }
    if (
      ts.isIfStatement(n) &&
      /\b(isLoading|isPending|loading)\b/.test(n.expression.getText(sf)) &&
      ts.isReturnStatement(
        ts.isBlock(n.thenStatement)
          ? (n.thenStatement.statements[0] ?? n.thenStatement)
          : n.thenStatement
      ) &&
      /return\s+null/.test(n.thenStatement.getText(sf))
    ) {
      add(
        'layout-shift:null-while-loading',
        n,
        'returns null while loading; reserve the space with a skeleton of the final size'
      );
    }
    ts.forEachChild(n, c => visit(c, depth));
  };
  visit(sf, 0);
  // surface:nested-bordered - box in box in box (three or more nested bordered surfaces).
  const borderedClass = text =>
    /(^|[\s'"`])border(?!-0\b|-none\b|-transparent\b)(-[a-z0-9/.[\]-]+)?(?=[\s'"`]|$)/.test(
      text
    );
  const isSurface = el => {
    const name = el.tagName.getText(sf);
    const attrs = el.attributes.getText(sf);
    return (
      borderedClass(attrs) ||
      /^(DrawerSurfaceCard|Card|ContentSurfaceCard|DialogSurface)$/.test(name)
    );
  };
  const surf = (n, depth) => {
    let d = depth;
    const opening = ts.isJsxElement(n)
      ? n.openingElement
      : ts.isJsxSelfClosingElement(n)
        ? n
        : null;
    if (opening && isSurface(opening)) {
      d += 1;
      if (d === 3)
        add(
          'surface:nested-bordered',
          n,
          'three nested bordered surfaces; flatten to one surface (card in panel in input box)'
        );
    }
    ts.forEachChild(n, c => surf(c, d));
  };
  surf(sf, 0);
  return findings;
}

/** Which states can this component reach? Derived from its source; waivers override. */
export function applicableStates(source, fileName) {
  const sf = parseSource(source, fileName);
  const text = source;
  const hasInput = /<(input|textarea|select)\b|<(Input|Textarea|Select)\b/.test(
    text
  );
  const loading =
    /\b(isLoading|isPending|isFetching|loading|pending|skeleton|Skeleton|useQuery|useSWR|Suspense)\b/.test(
      text
    );
  const dataList =
    /\.map\(|\b(items|rows|entries|links|releases|results|list)\b/.test(text);
  const errorish = /\b(error|isError|onError|errorMessage|catch)\b/.test(text);
  const textual =
    /\b(title|name|label|description|text|subtitle|message|children)\b/.test(
      text
    );
  const mutates =
    /\b(fetch\(|mutate|useMutation|onSubmit|submit|action=|startTransition|useActionState)\b/.test(
      text
    );
  const permission =
    /\b(permission|isAdmin|isOwner|canEdit|entitlement|role|gated|locked|upgrade|plan)\b/i.test(
      text
    );
  const optionalProps = (text.match(/\w+\?:/g) ?? []).length;
  void sf;
  const out = {};
  out.loading = loading;
  out.empty = dataList;
  out.error = errorish || mutates;
  out.partial = optionalProps >= 2 && textual;
  out['long-content'] = textual;
  out.offline = mutates || loading;
  out['permission-denied'] = permission;
  out['rtl-overflow'] = textual || hasInput;
  return out;
}

export function storyExportNames(storySource) {
  const names = [];
  for (const m of storySource.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g))
    names.push(m[1]);
  for (const m of storySource.matchAll(/export\s*\{([^}]+)\}/g))
    for (const part of m[1].split(','))
      names.push(
        part
          .trim()
          .split(/\s+as\s+/)
          .pop()
      );
  return names.filter(Boolean);
}

export function statesCovered(storySource) {
  const names = storyExportNames(storySource ?? '');
  const covered = {};
  for (const state of STATES)
    covered[state] = names.some(n => STATE_STORY_RE[state].test(n));
  return covered;
}

const INTERACTIVE =
  /\b(onClick|onChange|onSubmit|onKeyDown|onPress|onSelect|onOpenChange)\b|<(button|input|textarea|select|form|a)\b|<(Button|Input|Textarea|Select|Dialog|Sheet|Drawer|Menu)\b/;
const TEXT_INPUT = /<(input|textarea)\b|<(Input|Textarea)\b/;

function crit(id, status, extra = {}) {
  return { id, status, ...extra };
}

/**
 * @param {{path: string, source: string, testSource?: string|null, storySource?: string|null, mutationTestSources?: string[]|null, evidence?: any, waivers?: any, policy?: any, packagesUi?: boolean}} input
 */
export function certifyComponent({
  path,
  source,
  testSource = null,
  storySource = null,
  mutationTestSources,
  evidence = {},
  waivers = {},
  policy = DEFAULT_POLICY,
  packagesUi = false,
}) {
  // Receipt metadata cannot choose the bytes this certificate binds to.
  const sourceHash = sha(source);
  const sourceBound = receipt => receipt?.sourceHash === sourceHash;
  const mutationTests =
    mutationTestSources === undefined
      ? testSource === null
        ? []
        : [testSource]
      : mutationTestSources;
  const mutationKey =
    mutationTests === null
      ? null
      : moduleKey(gitBlob(source), mutationTests.map(gitBlob));
  const criteria = [];
  const missing = [];
  const miss = (criterion, reason, how) =>
    missing.push({ criterion, reason, how });

  // ds-owner
  const raw =
    packagesUi && /packages\/ui\/atoms\//.test(path)
      ? []
      : findRawElements(source, path);
  if (raw.length) {
    criteria.push(
      crit('ds-owner', 'fail', {
        detail: `raw elements: ${[...new Set(raw)].join(', ')}`,
      })
    );
    miss(
      'ds-owner',
      `raw ${[...new Set(raw)].join(', ')} instead of the canonical @jovie/ui atoms`,
      'Replace with Button/Input/Select/Textarea/Dialog from @jovie/ui or the family owner in docs/design-system/component-ownership.json'
    );
  } else criteria.push(crit('ds-owner', 'pass'));

  // tokens
  const colors = findRawColors(source, path);
  if (colors.length) {
    criteria.push(
      crit('tokens', 'fail', {
        detail: `${colors.length} raw colour value(s)`,
        samples: colors.slice(0, 5),
      })
    );
    miss(
      'tokens',
      `${colors.length} raw colour value(s), e.g. ${colors[0].value}`,
      'Use semantic design tokens only (DESIGN.md, design.tokens.json); no palette classes, hex, or colour functions'
    );
  } else criteria.push(crit('tokens', 'pass'));

  // states
  const applicable = applicableStates(source, path);
  const covered = statesCovered(storySource);
  const stateRows = {};
  const stateMissing = [];
  for (const s of STATES) {
    if (!applicable[s])
      stateRows[s] = {
        status: 'na',
        reason: 'not reachable from the component source',
      };
    else if (waivers[s])
      stateRows[s] = { status: 'waived', reason: waivers[s] };
    else if (covered[s]) stateRows[s] = { status: 'pass' };
    else {
      stateRows[s] = { status: 'fail' };
      stateMissing.push(s);
    }
  }
  if (!storySource && Object.values(applicable).some(Boolean)) {
    criteria.push(
      crit('states', 'fail', { states: stateRows, detail: 'no story file' })
    );
    miss(
      'states',
      'no adjacent story, so no state is demonstrated',
      `Add ${path.replace(/\.tsx$/, '.stories.tsx')} with one story per applicable state: ${STATES.filter(s => applicable[s]).join(', ')}`
    );
  } else if (stateMissing.length) {
    criteria.push(crit('states', 'fail', { states: stateRows }));
    miss(
      'states',
      `no story for: ${stateMissing.join(', ')}`,
      'Add a story export per state (names starting Loading, Empty, Error, Partial, LongContent, Offline, PermissionDenied, Rtl) or waive with a written reason in docs/design-system/component-certification.json'
    );
  } else criteria.push(crit('states', 'pass', { states: stateRows }));

  // tests
  const interactive = INTERACTIVE.test(source);
  const hasInputs = TEXT_INPUT.test(source);
  if (!testSource) {
    criteria.push(crit('tests', 'fail', { detail: 'no colocated test' }));
    miss(
      'tests',
      'no colocated unit test',
      `Add ${path.replace(/\.tsx$/, '.test.tsx')}`
    );
  } else {
    const interaction =
      /\b(userEvent|fireEvent|user\.(click|type|keyboard|tab))\b/.test(
        testSource
      );
    const problems = [];
    if (interactive && !interaction)
      problems.push('no interaction test (userEvent/fireEvent)');
    if (!/\bexpect\(/.test(testSource)) problems.push('no assertions');
    if (problems.length) {
      criteria.push(crit('tests', 'fail', { detail: problems.join('; ') }));
      miss(
        'tests',
        problems.join('; '),
        'Add Testing Library interaction tests for every handler and state'
      );
    } else criteria.push(crit('tests', 'pass'));
  }

  // a11y
  const axeInTest =
    !!testSource &&
    /expectNoA11yViolations|\baxe\(|vitest-axe|toHaveNoViolations/.test(
      testSource
    );
  const a11yEv = evidence.a11y;
  const a11yCurrent = sourceBound(a11yEv);
  if (a11yCurrent && a11yEv.status === 'pass')
    criteria.push(crit('a11y', 'pass', { source: 'storybook-a11y' }));
  else if (a11yCurrent && a11yEv.status === 'fail') {
    criteria.push(crit('a11y', 'fail', { detail: a11yEv.detail }));
    miss(
      'a11y',
      `axe violations: ${a11yEv.detail ?? 'see report'}`,
      'Fix violations; keep stories axe-clean'
    );
  } else if (axeInTest)
    criteria.push(crit('a11y', 'pass', { source: 'unit-axe' }));
  else {
    criteria.push(
      crit('a11y', 'unknown', {
        detail:
          a11yEv && !a11yCurrent
            ? 'CI a11y evidence is stale or missing a source hash'
            : 'no axe assertion in unit test and no CI a11y evidence',
      })
    );
    miss(
      'a11y',
      a11yEv && !a11yCurrent
        ? 'no current source-bound axe evidence'
        : 'no axe evidence',
      'Call expectNoA11yViolations(container) from apps/web/tests/utils/a11y.ts in the unit test for each rendered state'
    );
  }

  // frontend-rules
  const jank = findJank(source, path);
  const needsRetention = hasInputs;
  const retentionOk =
    !needsRetention ||
    (!!testSource &&
      /(userEvent|user)\.type\(/.test(testSource) &&
      /toHaveValue|\.value\)/.test(testSource));
  if (jank.length || !retentionOk) {
    criteria.push(
      crit('frontend-rules', 'fail', {
        findings: jank,
        inputRetentionTest: retentionOk,
      })
    );
    if (jank.length)
      miss(
        'frontend-rules',
        jank.map(j => `${j.rule}@${j.line}`).join(', '),
        'Fix per .claude/rules/ui.md Focus, Selection, and Stability plus the frontend-skill machine checks (pnpm design:conformance:gate)'
      );
    if (!retentionOk)
      miss(
        'frontend-rules',
        'no input-retention test (type, rerender, assert value kept)',
        'Add a test that types into every input, forces a parent rerender and an Escape/blur, and asserts toHaveValue is unchanged and focus stays'
      );
  } else criteria.push(crit('frontend-rules', 'pass'));

  // mutation
  const m = evidence.mutation;
  // The canonical sweep's blob is moduleKey(source blob, same-stem test
  // blobs). Its sha records the run's revision; an unchanged content key can
  // legitimately be reused after unrelated commits, as the sweep itself does.
  const mutationCurrent =
    m &&
    mutationKey !== null &&
    m.blob === mutationKey &&
    typeof m.sha === 'string' &&
    /^[0-9a-f]{40}$/i.test(m.sha) &&
    (m.sourceHash === undefined || sourceBound(m));
  const mutationMeasurement =
    m &&
    Number.isFinite(m.score) &&
    m.score >= 0 &&
    m.score <= 100 &&
    Number.isInteger(m.valid) &&
    m.valid >= 0;
  if (!m || m.status !== 'scored' || !mutationCurrent || !mutationMeasurement) {
    criteria.push(
      crit('mutation', 'unknown', {
        detail:
          m?.status === 'scored'
            ? !mutationCurrent
              ? 'mutation evidence is stale or unbound (source/test key or run revision)'
              : 'invalid mutation measurement (finite numeric score 0..100 and nonnegative integer valid required)'
            : m
              ? `status ${m.status}`
              : 'not scored',
      })
    );
    miss(
      'mutation',
      m?.status === 'scored'
        ? 'no current well-formed source/test-bound mutation score'
        : 'no mutation score',
      `node scripts/mutation-sweep.mjs --include ${path.replace(/^apps\/web\//, '')} (score must be >= ${policy.mutationMin})`
    );
  } else if (m.score >= policy.mutationMin)
    criteria.push(
      crit('mutation', 'pass', {
        score: m.score,
        valid: m.valid,
        sha: m.sha,
        blob: m.blob,
      })
    );
  else {
    criteria.push(
      crit('mutation', 'fail', {
        score: m.score,
        valid: m.valid,
        survived: m.survived,
      })
    );
    miss(
      'mutation',
      `score ${m.score} < ${policy.mutationMin} (${m.survived} survivors)`,
      'Kill survivors with behavior assertions (see ~/.local/state/jovie-mutation/survivor-tasks)'
    );
  }

  // visual
  const v = evidence.visual;
  const visualCurrent = sourceBound(v);
  if (visualCurrent && v.status === 'pass')
    criteria.push(crit('visual', 'pass', { captured: v.captured }));
  else if (visualCurrent && v.status === 'fail') {
    criteria.push(crit('visual', 'fail', { detail: v.detail }));
    miss('visual', v.detail ?? 'visual diff', 'Review the CI capture diff');
  } else {
    criteria.push(
      crit('visual', 'unknown', {
        detail:
          v && !visualCurrent
            ? 'CI capture is stale or missing a source hash'
            : 'no CI capture',
      })
    );
    miss(
      'visual',
      v && !visualCurrent
        ? 'no current source-bound CI capture'
        : 'no CI-captured baseline for the state stories',
      'Land state stories; the component-certificate workflow captures them in CI (never a Storybook build on gem)'
    );
  }

  // journeys
  const j = evidence.journeys;
  if (!j || j.journeys.length === 0)
    criteria.push(
      crit('journeys', 'na', { detail: 'not on a mapped journey' })
    );
  else if (j.uncovered.length) {
    criteria.push(
      crit('journeys', 'fail', { journeys: j.journeys, uncovered: j.uncovered })
    );
    miss(
      'journeys',
      `journey(s) with no browser spec: ${j.uncovered.join(', ')}`,
      'Cover the journey in a Playwright spec that exercises this component'
    );
  } else criteria.push(crit('journeys', 'pass', { journeys: j.journeys }));

  // benchmark
  const b = evidence.benchmark;
  if (!b) {
    criteria.push(
      crit('benchmark', 'unknown', { detail: 'no benchmark judgment recorded' })
    );
    miss(
      'benchmark',
      'not benchmarked against best-in-class',
      'Run the benchmark judgment and record adopt/adapt/skip per gap'
    );
  } else if (
    b.libraryVersion !== policy.benchmarkLibraryVersion ||
    b.sourceHash !== sourceHash
  ) {
    criteria.push(
      crit('benchmark', 'unknown', {
        detail: 'judgment stale (library version or source changed)',
      })
    );
    miss(
      'benchmark',
      'benchmark judgment is stale',
      'Re-judge against the current library and source'
    );
  } else {
    const open = (b.gaps ?? []).filter(
      g =>
        (g.decision === 'adopt' || g.decision === 'adapt') &&
        g.status !== 'done'
    );
    const badSkip = (b.gaps ?? []).filter(
      g => g.decision === 'skip' && !g.reason
    );
    if (open.length || badSkip.length) {
      criteria.push(crit('benchmark', 'fail', { open: open.map(g => g.item) }));
      miss(
        'benchmark',
        `${open.length} adopted gap(s) not implemented${badSkip.length ? `, ${badSkip.length} skip without reason` : ''}`,
        open.map(g => g.item).join('; ') || 'add a reason to each skip'
      );
    } else
      criteria.push(crit('benchmark', 'pass', { gaps: (b.gaps ?? []).length }));
  }

  const certified = criteria.every(
    c => c.status === 'pass' || c.status === 'na'
  );
  return {
    schema: CERT_SCHEMA,
    component: path,
    certified,
    passing: criteria.filter(c => c.status === 'pass').length,
    applicable: criteria.filter(c => c.status !== 'na').length,
    criteria,
    missing,
    binding: sourceHash,
  };
}

export function buildReport({
  certificates,
  headSha,
  now = new Date().toISOString(),
}) {
  const byCriterion = {};
  for (const id of CRITERIA)
    byCriterion[id] = { pass: 0, fail: 0, unknown: 0, na: 0 };
  for (const c of certificates)
    for (const k of c.criteria) byCriterion[k.id][k.status] += 1;
  return {
    schema: REPORT_SCHEMA,
    generatedAt: now,
    headSha,
    totals: {
      components: certificates.length,
      certified: certificates.filter(c => c.certified).length,
      byCriterion,
    },
    certificates,
  };
}

/** Agent-ready spec for one uncertified component: missing criteria + acceptance + commands. */
export function renderAgentSpec(
  cert,
  { journeyNotes = [], benchmarkGaps = [] } = {}
) {
  const section = (heading, rows) =>
    rows.length ? ['', heading, ...rows] : [];
  return [
    `# Certify ${cert.component}`,
    '',
    'Goal: make every criterion below pass so the component certificate reports certified. One small PR; UI fast lane if the diff stays visual-only (labels ui + fast and a Fast-track UI eligibility section with Why eligible, Before, After, Checks run).',
    '',
    '## Missing criteria',
    ...cert.missing.map(m => `- [${m.criterion}] ${m.reason}. Do: ${m.how}`),
    ...section(
      '## Adopted benchmark gaps (acceptance criteria)',
      benchmarkGaps.map(
        g => `- (${g.decision}) ${g.item} - reference: ${g.reference}`
      )
    ),
    ...section(
      '## Golden-path journeys touching this component',
      journeyNotes.map(n => `- ${n}`)
    ),
    '',
    '## Rules',
    '- Read DESIGN.md, .claude/rules/ui.md, .claude/rules/motion.md and the frontend skill contract (scripts/design-frontend-skill-check.mjs) first.',
    '- Semantic tokens only, canonical @jovie/ui atoms, no layout shift, focus and typed input survive every re-render, reduced-motion respected.',
    '- Adopt competitor behavior, never their visual identity.',
    '- Do not weaken or skip any check; never --no-verify.',
    '',
    '## Verify (targeted, do not run the full suite)',
    `- pnpm --filter @jovie/web exec vitest run ${cert.component.replace(/^apps\/web\//, '').replace(/\.tsx$/, '')}`,
    `- node scripts/component-certificate.mjs --component ${cert.component}`,
    '- pnpm design:conformance:gate',
  ].join('\n');
}

export const GUARD_TYPES = Object.freeze([
  'lint-ast-rule',
  'ds-primitive-constraint',
  'shared-test-helper',
  'frontend-skill-rule',
  'dogfood-assertion',
  'benchmark-entry',
  'search-relevance-fixture',
]);
export const FOUND_BY = Object.freeze(['human', 'guard', 'agent']);

const isoWeek = iso => {
  const d = new Date(iso);
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)).padStart(2, '0')}`;
};

/** Defect -> guard registry check + weekly measure (found by humans vs caught by guards). */
export function summarizeGuards(registry) {
  const errors = [];
  const weeks = {};
  let withGuard = 0;
  for (const d of registry.defects ?? []) {
    if (!d.id || !d.class || !FOUND_BY.includes(d.foundBy) || !d.foundAt)
      errors.push(`${d.id ?? '?'}: id, class, foundBy, foundAt required`);
    if (
      !d.guard ||
      !GUARD_TYPES.includes(d.guard.type) ||
      !d.guard.ref ||
      !['landed', 'planned'].includes(d.guard.status)
    )
      errors.push(
        `${d.id ?? '?'}: guard {type, ref, status landed|planned} required (every defect maps to the cheapest durable guard)`
      );
    else if (d.guard.status === 'landed') withGuard += 1;
    const w = isoWeek(d.foundAt);
    weeks[w] ??= { human: 0, guard: 0, agent: 0 };
    if (FOUND_BY.includes(d.foundBy)) weeks[w][d.foundBy] += 1;
  }
  const total = (registry.defects ?? []).length;
  return {
    errors,
    total,
    guardsLanded: withGuard,
    guardCoverage: total ? withGuard / total : null,
    weeks,
  };
}
