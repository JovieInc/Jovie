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
const GLOBALS_CSS_SOURCE = readFileSync(
  resolve(REPO_ROOT, 'apps/web/app/globals.css'),
  'utf8'
);
const DESIGN_SYSTEM_CSS_SOURCE = readFileSync(
  resolve(REPO_ROOT, 'apps/web/styles/design-system.css'),
  'utf8'
);
const SCOPE = ['packages/ui'];
const ATOM = 'packages/ui/atoms/button.tsx';
const COVERED_PRODUCTION_SOURCES = [
  'packages/ui/index.ts',
  'packages/ui/confirm-dialog.tsx',
  'packages/ui/hooks/index.ts',
  'packages/ui/hooks/useTabOverflow.ts',
  'packages/ui/media/logo-normalization.ts',
  'packages/ui/theme/motion-policy.ts',
  'packages/ui/theme/tokens.ts',
  'packages/ui/lib/badge-geometry-contract.ts',
];
const EXCLUDED_NON_PRODUCTION_SOURCES = [
  'packages/ui/index.test.ts',
  'packages/ui/confirm-dialog.stories.tsx',
  'packages/ui/confirm-dialog.test.tsx',
  'packages/ui/vitest.setup.ts',
  'packages/ui/media/logo-normalization.test.ts',
  'packages/ui/theme/motion-policy.test.ts',
  'packages/ui/atoms/fixtures/cropped-artwork-avatar.tsx',
  'packages/ui/atoms/fixtures/badge-geometry-drift-fixtures.tsx',
  'packages/ui/generated/red.tsx',
];

const DELIBERATE_RED = `
export function DeliberateRedVisualArbitrary() {
  return (
    <div className="w-[327px] text-[#ff00aa] h-[42px] rounded-[12px]" />
  );
}
`;

const RETIRED_BASELINE_DELIBERATE_RED = `
export function RetiredBaselineVisualArbitrary() {
  return (
    <div className="hover:shadow-[0_10px_24px_rgba(10,12,18,0.1)] animate-[progress-indeterminate_1.5s_ease-in-out_infinite] max-h-[calc(100dvh-1rem)] w-[min(26rem,calc(100vw-1rem))] z-[150] tracking-[-0.015em]" />
  );
}
`;

const RETIRED_TOOLTIP_PILL_DELIBERATE_RED = `
const compactTooltipShape =
  contentVariant === 'compact'
    ? 'rounded-full whitespace-nowrap'
    : 'rounded-(--system-b-radius-overlay) max-w-56 break-words';
`;

const DELIBERATE_ALLOWED = `
export function AllowedSemanticAndState() {
  return (
    <button
      className="data-[state=open]:bg-surface-1 aria-[expanded=true]:text-primary-token opacity-[var(--state-disabled-opacity)] h-[var(--radix-select-trigger-height)] min-w-[var(--radix-select-trigger-width)] max-h-overlay-viewport text-(--linear-text-primary) transition-[background-color,opacity] before:content-[''] origin-[--radix-dropdown-menu-content-transform-origin] [font-weight:var(--font-weight-medium)]"
    />
  );
}
`;

const CSS_VAR_VISUAL_DELIBERATE_RED = `
export function CssVarVisualDeliberateRed() {
  return (
    <div className="w-[var(--fixed-width)] rounded-[var(--radius)] z-[var(--layer)] text-[var(--color-error-foreground)] bg-[color-mix(in_srgb,var(--linear-bg-surface-1)_84%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_88%,transparent)] active:scale-[var(--scale-press)]" />
  );
}
`;

const ZERO_BASELINE_SOURCE_CONTRACT = {
  'packages/ui/atoms/icon-button.tsx': [
    'bg-icon-button-frosted',
    'hover:bg-icon-button-frosted-hover',
    'hover:bg-icon-button-pearl-quiet-hover',
    'hover:shadow-sm',
    'focus-visible:shadow-sm',
  ],
  'packages/ui/atoms/button.tsx': [
    'text-error-foreground',
    'active:scale-press',
  ],
  'packages/ui/atoms/progress.tsx': ['animate-progress-indeterminate'],
  'packages/ui/atoms/sheet.tsx': [
    'max-h-sheet-viewport',
    'w-104 max-w-sheet-viewport',
  ],
  'packages/ui/atoms/tooltip.tsx': ['z-tooltip'],
  'packages/ui/lib/overlay-styles.ts': [
    'max-h-overlay-viewport',
    'w-overlay-viewport',
    'tracking-tight',
    'z-sheet',
  ],
};

test('repo shared-UI visual arbitrary findings match the shrink-only baseline', () => {
  const result = evaluateSharedUiVisualArbitraryAudit({ eventName: 'local' });
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(result.status, 'pass');
  assert.equal(result.totalFindings, 0);
  assert.deepEqual(result.findings, []);
  assert.equal(result.scannedFiles.length, 59);
  for (const relativePath of COVERED_PRODUCTION_SOURCES) {
    assert.equal(
      result.scannedFiles.includes(relativePath),
      true,
      relativePath
    );
  }
  for (const relativePath of EXCLUDED_NON_PRODUCTION_SOURCES) {
    assert.equal(
      result.scannedFiles.includes(relativePath),
      false,
      relativePath
    );
  }
});

test('baseline schema is exact file/value/count and sorted', () => {
  const baseline = JSON.parse(
    readFileSync(resolve(REPO_ROOT, BASELINE_PATH), 'utf8')
  );
  assert.deepEqual(validateVisualArbitraryBaseline(baseline), []);
  assert.equal(baseline.schema, SCHEMA);
  assert.deepEqual(baseline.scope, SCOPE);
  assert.equal(baseline.totalFindings, 0);
  assert.deepEqual(baseline.findings, []);
  assert.ok(
    baseline.findings.every(
      finding => isSharedUiProductionSource(finding.file) && finding.count > 0
    )
  );
  assert.match(
    serializeVisualArbitraryBaseline(baseline),
    /"totalFindings": 0/
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
        scope: ['packages/ui/atoms', 'packages/ui/lib'],
        totalFindings: 1,
        findings: [
          { file: 'packages/ui/atoms/a.tsx', value: 'w-[1px]', count: 1 },
        ],
      },
      /scope must be/,
    ],
    [
      {
        schema: SCHEMA,
        scope: SCOPE,
        totalFindings: 1,
        findings: [
          { file: 'packages/ui/generated/red.tsx', value: 'w-[1px]', count: 1 },
        ],
      },
      /outside production scope/,
    ],
    [
      {
        schema: SCHEMA,
        scope: SCOPE,
        totalFindings: 1,
        findings: [
          { file: 'packages/ui/vitest.setup.ts', value: 'w-[1px]', count: 1 },
        ],
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

test('every retired baseline utility remains deliberate-red', () => {
  const red = collectVisualArbitraryFindingsFromSource(
    'packages/ui/atoms/retired-baseline-red.tsx',
    RETIRED_BASELINE_DELIBERATE_RED
  );
  assert.deepEqual(red.map(item => item.value).sort(), [
    'animate-[progress-indeterminate_1.5s_ease-in-out_infinite]',
    'hover:shadow-[0_10px_24px_rgba(10,12,18,0.1)]',
    'max-h-[calc(100dvh-1rem)]',
    'tracking-[-0.015em]',
    'w-[min(26rem,calc(100vw-1rem))]',
    'z-[150]',
  ]);
});

test('css-variable visual utility families remain deliberate-red', () => {
  const red = collectVisualArbitraryFindingsFromSource(
    'packages/ui/atoms/css-var-visual-red.tsx',
    CSS_VAR_VISUAL_DELIBERATE_RED
  );
  assert.deepEqual(red.map(item => item.value).sort(), [
    'active:scale-[var(--scale-press)]',
    'bg-[color-mix(in_srgb,var(--linear-bg-surface-1)_84%,transparent)]',
    'hover:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_88%,transparent)]',
    'rounded-[var(--radius)]',
    'text-[var(--color-error-foreground)]',
    'w-[var(--fixed-width)]',
    'z-[var(--layer)]',
  ]);
});

function assertTooltipRoundedRectangleContract(source) {
  assert.equal(
    source.includes('rounded-full'),
    false,
    'tooltip compact content must not regress to a pill'
  );
  assert.equal(
    source.includes('OVERLAY_CONTENT_RADIUS'),
    true,
    'tooltip content must use the shared rounded-rectangle radius'
  );
}

test('retired compact tooltip pill remains deliberate-red', () => {
  assert.throws(
    () =>
      assertTooltipRoundedRectangleContract(
        RETIRED_TOOLTIP_PILL_DELIBERATE_RED
      ),
    /tooltip compact content must not regress to a pill/
  );
});

test('zero baseline sources keep their canonical token and utility contracts', () => {
  for (const [relativePath, requiredClasses] of Object.entries(
    ZERO_BASELINE_SOURCE_CONTRACT
  )) {
    const source = readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
    assert.deepEqual(
      collectVisualArbitraryFindingsFromSource(relativePath, source),
      [],
      relativePath
    );
    for (const requiredClass of requiredClasses) {
      assert.equal(source.includes(requiredClass), true, requiredClass);
    }
    if (relativePath === 'packages/ui/lib/overlay-styles.ts') {
      assert.equal(source.includes('--ds-marketing'), false);
    }
    if (
      relativePath === 'packages/ui/atoms/sheet.tsx' ||
      relativePath === 'packages/ui/lib/overlay-styles.ts'
    ) {
      assert.equal(source.includes('[calc('), false, relativePath);
      assert.equal(source.includes('-[calc('), false, relativePath);
    }
    if (relativePath === 'packages/ui/atoms/tooltip.tsx') {
      assertTooltipRoundedRectangleContract(source);
    }
  }
});

test('canonical CSS authority preserves the retired values exactly', () => {
  assert.match(
    GLOBALS_CSS_SOURCE,
    /--animate-progress-indeterminate:\s*progress-indeterminate 1\.5s ease-in-out\s+infinite;/
  );
  assert.match(GLOBALS_CSS_SOURCE, /@keyframes progress-indeterminate\s*\{/);
  assert.match(GLOBALS_CSS_SOURCE, /--z-index-sheet:\s*65;/);
  assert.match(GLOBALS_CSS_SOURCE, /--z-index-tooltip:\s*150;/);
  assert.match(DESIGN_SYSTEM_CSS_SOURCE, /--space-4:\s*1rem;/);
  assert.match(DESIGN_SYSTEM_CSS_SOURCE, /--space-8:\s*2rem;/);
  assert.match(
    DESIGN_SYSTEM_CSS_SOURCE,
    /--ds-marketing-lede-tracking:\s*-0\.015em;/
  );
});

test('classifier keeps exclusions narrow', () => {
  const cases = [
    ['w-[327px]', KINDS.VISUAL],
    ['text-[#fff]', KINDS.VISUAL],
    ['data-[state=open]', KINDS.STATE],
    ['opacity-[var(--state-disabled-opacity)]', KINDS.CSS_VAR],
    ['disabled:opacity-[var(--state-disabled-opacity)]', KINDS.CSS_VAR],
    ['opacity-[var(--state-partial-opacity)]', KINDS.CSS_VAR],
    ['h-[var(--radix-select-trigger-height)]', KINDS.CSS_VAR],
    ['min-w-[var(--radix-select-trigger-width)]', KINDS.CSS_VAR],
    ['origin-[--radix-dropdown-menu-content-transform-origin]', KINDS.CSS_VAR],
    ['max-h-[calc(100dvh-var(--space-8))]', KINDS.VISUAL],
    ['w-[calc(100vw-var(--space-8))]', KINDS.VISUAL],
    ['sm:!max-w-[calc(100vw-var(--space-4))]', KINDS.VISUAL],
    ['w-[var(--fixed-width)]', KINDS.VISUAL],
    ['rounded-[var(--radius)]', KINDS.VISUAL],
    ['z-[var(--layer)]', KINDS.VISUAL],
    ['text-[var(--color-error-foreground)]', KINDS.VISUAL],
    [
      'bg-[color-mix(in_srgb,var(--linear-bg-surface-1)_84%,transparent)]',
      KINDS.VISUAL,
    ],
    ['bg-[color:var(--surface-token)]', KINDS.VISUAL],
    [
      'hover:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_88%,transparent)]',
      KINDS.VISUAL,
    ],
    ['focus-visible:text-[color:var(--focus-text)]', KINDS.VISUAL],
    ['active:scale-[var(--scale-press)]', KINDS.VISUAL],
    ['transition-[background-color,box-shadow]', KINDS.TRANSITION],
    ["before:content-['']", KINDS.CONTENT],
    ['[stroke-width:2.5]', KINDS.CSS_PROPERTY],
  ];
  for (const [token, kind] of cases) {
    assert.equal(classifySharedUiArbitraryToken(token), kind, token);
  }
});

test('growth is a regression in every event, including merge_group', () => {
  const hook = 'packages/ui/hooks/useTabOverflow.ts';
  const baseline = toVisualArbitraryBaseline([
    { file: ATOM, value: 'text-[13px]', count: 1 },
  ]);
  const current = [
    { file: ATOM, value: 'text-[13px]', count: 1 },
    { file: ATOM, value: 'w-[327px]', count: 1 },
    { file: hook, value: 'min-h-[80px]', count: 1 },
  ];
  for (const eventName of ['local', 'pull_request', 'merge_group']) {
    const verdict = compareVisualArbitraryBaseline(current, baseline, {
      eventName,
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 'regression');
    assert.match(verdict.issues.join('\n'), /w-\[327px\]/);
    assert.match(verdict.issues.join('\n'), /min-h-\[80px\]/);
  }
});

test('zero baseline rejects the first visual arbitrary in every event', () => {
  const baseline = toVisualArbitraryBaseline([]);
  const current = [{ file: ATOM, value: 'w-[327px]', count: 1 }];
  for (const eventName of ['local', 'pull_request', 'merge_group']) {
    const verdict = compareVisualArbitraryBaseline(current, baseline, {
      eventName,
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.status, 'regression');
    assert.match(verdict.issues.join('\n'), /w-\[327px\]/);
    assert.match(verdict.issues.join('\n'), /baseline ×0/);
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

test('root, hooks, media, and theme production sources are in scope', () => {
  for (const relativePath of COVERED_PRODUCTION_SOURCES) {
    assert.equal(isSharedUiProductionSource(relativePath), true, relativePath);
  }
  for (const relativePath of EXCLUDED_NON_PRODUCTION_SOURCES) {
    assert.equal(isSharedUiProductionSource(relativePath), false, relativePath);
  }
  assert.equal(
    isSharedUiProductionSource('packages/ui/atoms/button.tsx'),
    true
  );
  assert.equal(
    isSharedUiProductionSource('packages/ui/lib/overlay-styles.ts'),
    true
  );
});

test('scanner covers the full package and skips non-production sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'shared-ui-visual-arbitrary-'));
  try {
    mkdirSync(join(root, 'packages/ui/atoms/fixtures'), { recursive: true });
    mkdirSync(join(root, 'packages/ui/generated'), { recursive: true });
    mkdirSync(join(root, 'packages/ui/hooks'), { recursive: true });
    mkdirSync(join(root, 'packages/ui/lib'), { recursive: true });
    mkdirSync(join(root, 'packages/ui/media'), { recursive: true });
    mkdirSync(join(root, 'packages/ui/theme'), { recursive: true });
    const files = {
      'packages/ui/root-live.tsx': 'export const x = "rounded-[12px]";\n',
      'packages/ui/index.test.ts': 'export const x = "w-[1px]";\n',
      'packages/ui/root-live.stories.tsx': 'export const x = "h-[1px]";\n',
      'packages/ui/vitest.setup.ts': 'export const x = "text-[#111111]";\n',
      'packages/ui/atoms/live.tsx': 'export const x = "w-[327px]";\n',
      'packages/ui/atoms/live.test.tsx': 'export const x = "text-[#ff00aa]";\n',
      'packages/ui/atoms/live.stories.tsx': 'export const x = "h-[42px]";\n',
      'packages/ui/atoms/fixtures/red.tsx':
        'export const x = "rounded-[12px]";\n',
      'packages/ui/generated/red.tsx': 'export const x = "w-[999px]";\n',
      'packages/ui/hooks/live.ts': 'export const x = "min-h-[80px]";\n',
      'packages/ui/hooks/live.test.ts': 'export const x = "w-[2px]";\n',
      'packages/ui/lib/overlay-styles.ts': 'export const x = "z-[65]";\n',
      'packages/ui/media/live.ts': 'export const x = "max-h-[120px]";\n',
      'packages/ui/media/live.test.ts': 'export const x = "h-[3px]";\n',
      'packages/ui/theme/live.ts': 'export const x = "tracking-[-0.01em]";\n',
      'packages/ui/theme/live.test.ts': 'export const x = "text-[9px]";\n',
    };
    for (const [relativePath, source] of Object.entries(files)) {
      writeFileSync(join(root, relativePath), source);
    }
    const measured = scanSharedUiVisualArbitrary(root);
    assert.deepEqual(measured.scannedFiles, [
      'packages/ui/atoms/live.tsx',
      'packages/ui/hooks/live.ts',
      'packages/ui/lib/overlay-styles.ts',
      'packages/ui/media/live.ts',
      'packages/ui/root-live.tsx',
      'packages/ui/theme/live.ts',
    ]);
    assert.equal(measured.totalFindings, 6);
    assert.deepEqual(
      measured.findings.map(item => `${item.file} ${item.value}`),
      [
        'packages/ui/atoms/live.tsx w-[327px]',
        'packages/ui/hooks/live.ts min-h-[80px]',
        'packages/ui/lib/overlay-styles.ts z-[65]',
        'packages/ui/media/live.ts max-h-[120px]',
        'packages/ui/root-live.tsx rounded-[12px]',
        'packages/ui/theme/live.ts tracking-[-0.01em]',
      ]
    );
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
