import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { LANE_COMMANDS } from './ci-fast-lanes.mjs';
import { classifyDesignPath } from './design-conformance-paths.mjs';
import {
  BASELINE_PATH,
  CHECK_COMMAND,
  classifySharedUiArbitraryToken,
  collectVisualArbitraryFindingsFromSource,
  compareVisualArbitraryBaseline,
  evaluateSharedUiVisualArbitraryAudit,
  extractSharedUiArbitraryTokens,
  isSharedUiProductionSource,
  KINDS,
  REPO_ROOT,
  SCHEMA,
  scanSharedUiVisualArbitrary,
  serializeVisualArbitraryBaseline,
  toVisualArbitraryBaseline,
  validateVisualArbitraryBaseline,
} from './shared-ui-visual-arbitrary-audit.mjs';

const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
);
const CI_FAST_SOURCE = readFileSync(
  resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs'),
  'utf8'
);
const GATE_SOURCE = readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8');
const SCOPE = ['packages/ui/atoms', 'packages/ui/lib'];
const ATOM = 'packages/ui/atoms/button.tsx';

const DELIBERATE_RED = `
export function DeliberateRedVisualArbitrary() {
  return (
    <div className="w-[327px] text-[#ff00aa] h-[42px] rounded-[12px]" />
  );
}
`;

const DELIBERATE_ALLOWED = `
export function AllowedSemanticAndState() {
  return (
    <button
      className="data-[state=open]:bg-surface-1 aria-[expanded=true]:text-primary-token opacity-[var(--state-disabled-opacity)] text-(--linear-text-primary) transition-[background-color,opacity] before:content-[''] origin-[--radix-dropdown-menu-content-transform-origin] [font-weight:var(--font-weight-medium)]"
    />
  );
}
`;

test('repo shared-UI visual arbitrary findings match the shrink-only baseline', () => {
  const result = evaluateSharedUiVisualArbitraryAudit({ eventName: 'local' });
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(result.status, 'pass');
  assert.equal(result.totalFindings, 52);
  assert.equal(result.scannedFiles.length, 50);
});

test('baseline schema is exact file/value/count and sorted', () => {
  const baseline = JSON.parse(
    readFileSync(resolve(REPO_ROOT, BASELINE_PATH), 'utf8')
  );
  assert.deepEqual(validateVisualArbitraryBaseline(baseline), []);
  assert.equal(baseline.schema, SCHEMA);
  assert.equal(baseline.totalFindings, 52);
  assert.equal(baseline.findings.length, 41);
  assert.ok(
    baseline.findings.every(
      finding => isSharedUiProductionSource(finding.file) && finding.count > 0
    )
  );
  assert.match(
    serializeVisualArbitraryBaseline(baseline),
    /"totalFindings": 52/
  );
  const bad = evaluateSharedUiVisualArbitraryAudit({
    baseline: { schema: 'nope' },
    eventName: 'local',
  });
  assert.equal(bad.ok, false);
  assert.match(bad.issues.join('\n'), /schema must be/);
  /** @type {[unknown, RegExp][]} */
  const cases = [
    [{ schema: 'nope' }, /schema must be/],
    [null, /JSON object/],
    [
      {
        schema: SCHEMA,
        scope: SCOPE,
        totalFindings: 1,
        findings: [{ file: 'apps/web/button.tsx', value: 'w-[1px]', count: 1 }],
      },
      /outside production scope/,
    ],
    [
      {
        schema: SCHEMA,
        scope: SCOPE,
        totalFindings: 1,
        findings: [{ file: 'packages/ui/atoms/a.tsx' }],
      },
      /positive count/,
    ],
    [
      {
        schema: SCHEMA,
        scope: SCOPE,
        totalFindings: 2,
        findings: [
          { file: 'packages/ui/atoms/b.tsx', value: 'w-[1px]', count: 1 },
          { file: 'packages/ui/atoms/a.tsx', value: 'w-[1px]', count: 1 },
        ],
      },
      /sorted by file/,
    ],
    [
      {
        schema: SCHEMA,
        scope: SCOPE,
        totalFindings: 9,
        findings: [
          { file: 'packages/ui/atoms/a.tsx', value: 'w-[1px]', count: 1 },
        ],
      },
      /does not match finding counts/,
    ],
  ];
  for (const [input, pattern] of cases) {
    assert.match(validateVisualArbitraryBaseline(input).join('\n'), pattern);
  }
});

test('deliberate-red visual tokens are findings; semantic and state variants are not', () => {
  const red = collectVisualArbitraryFindingsFromSource(
    'packages/ui/atoms/deliberate-red.tsx',
    DELIBERATE_RED
  );
  assert.deepEqual(red.map(item => item.value).sort(), [
    'h-[42px]',
    'rounded-[12px]',
    'text-[#ff00aa]',
    'w-[327px]',
  ]);
  assert.equal(
    red.reduce((sum, item) => sum + item.count, 0),
    4
  );
  const allowed = extractSharedUiArbitraryTokens(DELIBERATE_ALLOWED);
  assert.ok(allowed.length > 0);
  assert.equal(
    allowed.some(item => item.kind === KINDS.VISUAL),
    false,
    allowed
      .filter(item => item.kind === KINDS.VISUAL)
      .map(item => item.token)
      .join(', ')
  );
  for (const kind of [
    KINDS.STATE,
    KINDS.CSS_VAR,
    KINDS.TRANSITION,
    KINDS.CONTENT,
  ]) {
    assert.ok(
      allowed.some(item => item.kind === kind),
      kind
    );
  }
});

test('classifier keeps exclusions narrow', () => {
  const cases = [
    ['w-[327px]', KINDS.VISUAL],
    ['text-[#fff]', KINDS.VISUAL],
    ['data-[state=open]', KINDS.STATE],
    ['opacity-[var(--state-disabled-opacity)]', KINDS.CSS_VAR],
    [
      'bg-[color-mix(in_srgb,var(--linear-bg-surface-1)_84%,transparent)]',
      KINDS.CSS_VAR,
    ],
    ['transition-[background-color,box-shadow]', KINDS.TRANSITION],
    ["before:content-['']", KINDS.CONTENT],
    ['[stroke-width:2.5]', KINDS.CSS_PROPERTY],
  ];
  for (const [token, kind] of cases) {
    assert.equal(classifySharedUiArbitraryToken(token), kind, token);
  }
});

test('growth is a regression in every event, including merge_group', () => {
  const baseline = toVisualArbitraryBaseline([
    { file: ATOM, value: 'text-[13px]', count: 1 },
  ]);
  const current = [
    { file: ATOM, value: 'text-[13px]', count: 1 },
    { file: ATOM, value: 'w-[327px]', count: 1 },
  ];
  for (const eventName of ['local', 'pull_request', 'merge_group']) {
    const verdict = compareVisualArbitraryBaseline(current, baseline, {
      eventName,
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 'regression');
    assert.match(verdict.issues.join('\n'), /w-\[327px\]/);
  }
});

test('unbaselined shrink fails locally and is sibling-safe on merge_group', () => {
  const baseline = toVisualArbitraryBaseline([
    { file: ATOM, value: 'text-[13px]', count: 2 },
  ]);
  const current = [{ file: ATOM, value: 'text-[13px]', count: 1 }];
  const local = compareVisualArbitraryBaseline(current, baseline, {
    eventName: 'local',
  });
  assert.equal(local.ok, false);
  assert.equal(local.status, 'unbaselined_shrink');
  const mergeGroup = compareVisualArbitraryBaseline(current, baseline, {
    eventName: 'merge_group',
  });
  assert.equal(mergeGroup.ok, true);
  assert.equal(mergeGroup.status, 'sibling_shrink');
});

test('scanner skips tests, stories, and fixtures', () => {
  const root = mkdtempSync(join(tmpdir(), 'shared-ui-visual-arbitrary-'));
  try {
    mkdirSync(join(root, 'packages/ui/atoms/fixtures'), { recursive: true });
    mkdirSync(join(root, 'packages/ui/lib'), { recursive: true });
    const files = {
      'packages/ui/atoms/live.tsx': 'export const x = "w-[327px]";\n',
      'packages/ui/atoms/live.test.tsx': 'export const x = "text-[#ff00aa]";\n',
      'packages/ui/atoms/live.stories.tsx': 'export const x = "h-[42px]";\n',
      'packages/ui/atoms/fixtures/red.tsx':
        'export const x = "rounded-[12px]";\n',
      'packages/ui/lib/overlay-styles.ts': 'export const x = "z-[65]";\n',
    };
    for (const [relativePath, source] of Object.entries(files)) {
      writeFileSync(join(root, relativePath), source);
    }
    const measured = scanSharedUiVisualArbitrary(root);
    assert.deepEqual(measured.scannedFiles, [
      'packages/ui/atoms/live.tsx',
      'packages/ui/lib/overlay-styles.ts',
    ]);
    assert.equal(measured.totalFindings, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('design governance and hosted structural CI keep the audit wired', () => {
  assert.equal(
    PACKAGE_JSON.scripts['design:shared-ui-visual-arbitrary:check'],
    'node scripts/shared-ui-visual-arbitrary-audit.mjs'
  );
  assert.match(
    GATE_SOURCE,
    /design:conformance:gate.*design:shared-ui-visual-arbitrary:check/
  );
  assert.match(
    PACKAGE_JSON.scripts['design:conformance:test'],
    /shared-ui-visual-arbitrary-audit\.test\.mjs/
  );
  assert.ok(CI_FAST_SOURCE.includes(CHECK_COMMAND));
  assert.match(
    LANE_COMMANDS.structural,
    /pnpm design:shared-ui-visual-arbitrary:check/
  );
  for (const path of [
    'scripts/shared-ui-visual-arbitrary-audit.mjs',
    'scripts/shared-ui-visual-arbitrary.baseline.json',
  ]) {
    assert.equal(classifyDesignPath(path).domains.includes('governance'), true);
  }
});
