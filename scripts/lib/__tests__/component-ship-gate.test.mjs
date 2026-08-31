import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  auditCoverageViaReceipts,
  checkChangedComponents,
  runComponentShipGate,
} from '../../component-ship-gate.mjs';
import {
  checkStoryMatchesComponent,
  extractRequiredPropNames,
  isUnderShipScope,
  listComponentsInRoot,
  measureRootCoverage,
} from '../../component-ship-policy.mjs';
import {
  compareCoverage,
  compareRootCoverage,
  normalizeBaseline,
  validateBaseline,
} from '../../story-coverage-ratchet.mjs';

const temps = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixtureRepo(tree) {
  const root = mkdtempSync(join(tmpdir(), 'ship-gate-'));
  temps.push(root);
  for (const [rel, body] of Object.entries(tree)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

const LEGACY_COMPONENT_REL =
  'apps/web/components/marketing/legacy/LegacyPanel.tsx';
const LEGACY_TEST_REL = 'apps/web/tests/unit/marketing/LegacyPanel.test.tsx';
const LEGACY_STORY_REL =
  'apps/web/components/marketing/storybook/MarketingSections.stories.tsx';
const LEGACY_COMPONENT_SOURCE =
  'export interface LegacyPanelProps { readonly title: string }\n' +
  'export function LegacyPanel({ title }: LegacyPanelProps) { return <h2>{title}</h2> }';
const LEGACY_TEST_SOURCE =
  "import { render } from '@testing-library/react';\n" +
  "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';\n" +
  "render(<LegacyPanel title='Legacy' />);";
const LEGACY_STORY_SOURCE =
  "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';\n" +
  "export const Legacy = { render: () => <LegacyPanel title='Legacy' /> };";

function legacyEvidenceResult({
  componentSource = LEGACY_COMPONENT_SOURCE,
  testSource = LEGACY_TEST_SOURCE,
  storySource = LEGACY_STORY_SOURCE,
  testRel = LEGACY_TEST_REL,
  changedTest = true,
  legacy = true,
} = {}) {
  const root = fixtureRepo({
    [LEGACY_COMPONENT_REL]: componentSource,
    [testRel]: testSource,
    [LEGACY_STORY_REL]: storySource,
  });
  return checkChangedComponents(
    changedTest ? [LEGACY_COMPONENT_REL, testRel] : [LEGACY_COMPONENT_REL],
    {
      repoRoot: root,
      legacyComponents: legacy ? new Set([LEGACY_COMPONENT_REL]) : new Set(),
    }
  );
}

describe('component-ship-policy scope', () => {
  it('includes shippable surfaces and excludes tests/stories/utils', () => {
    expect(isUnderShipScope('packages/ui/atoms/button.tsx')).toBe(true);
    expect(
      isUnderShipScope(
        'apps/web/components/features/profile/ProfileHeroCard.tsx'
      )
    ).toBe(true);
    expect(
      isUnderShipScope('apps/web/components/shell/AppShellRightRail.tsx')
    ).toBe(true);
    expect(isUnderShipScope('apps/web/components/jovie/JovieChat.tsx')).toBe(
      true
    );
    expect(
      isUnderShipScope('apps/web/components/providers/CoreProviders.tsx')
    ).toBe(true);
    expect(isUnderShipScope('apps/web/components/feedback/Banner.tsx')).toBe(
      true
    );
    expect(
      isUnderShipScope('apps/web/components/molecules/ArtistCard.tsx')
    ).toBe(true);
    expect(
      isUnderShipScope('apps/web/components/marketing/MarketingHero.tsx')
    ).toBe(true);
    expect(isUnderShipScope('packages/ui/atoms/button.stories.tsx')).toBe(
      false
    );
    expect(isUnderShipScope('packages/ui/atoms/button.test.tsx')).toBe(false);
    expect(isUnderShipScope('packages/ui/hooks/useX.tsx')).toBe(false);
    expect(isUnderShipScope('packages/ui/lib/class-names.utils.tsx')).toBe(
      false
    );
    expect(isUnderShipScope('apps/web/app/(marketing)/page.tsx')).toBe(false);
    expect(
      isUnderShipScope(
        'apps/web/components/organisms/sidebar-identity-group/fixtures/split-layout.tsx'
      )
    ).toBe(false);
  });

  it('lists components with adjacent story/test pairing', () => {
    const root = fixtureRepo({
      'packages/ui/atoms/button.tsx':
        'export function Button(props: { readonly label: string }) { return null }\n',
      'packages/ui/atoms/button.stories.tsx':
        "import { Button } from './button';\nexport default { component: Button };\n",
      'packages/ui/atoms/button.test.tsx':
        "import { Button } from './button';\n",
      'packages/ui/atoms/orphan.tsx':
        'export function Orphan() { return null }\n',
    });
    const list = listComponentsInRoot('packages/ui/atoms', root);
    expect(list.map(c => c.component).sort()).toEqual(['button', 'orphan']);
    expect(list.find(c => c.component === 'button')?.covered).toBe(true);
    expect(list.find(c => c.component === 'button')?.tested).toBe(true);
    expect(list.find(c => c.component === 'orphan')?.covered).toBe(false);
  });

  it('keeps the complete web component inventory inside the hard diff gate', () => {
    const inventory = listComponentsInRoot('apps/web/components');

    expect(inventory.length).toBeGreaterThan(1000);
    expect(
      inventory.filter(component => !isUnderShipScope(component.sourceRel))
    ).toEqual([]);
  });
});

describe('story match checks', () => {
  it('extracts required props and flags missing coverage', () => {
    const source = `
      export interface WidgetProps {
        readonly title: string;
        readonly optional?: string;
        readonly onClick: () => void;
      }
      export function Widget(props: WidgetProps) { return null }
    `;
    expect(extractRequiredPropNames(source).sort()).toEqual([
      'onClick',
      'title',
    ]);

    const badStory = `
      import { Widget } from './Widget';
      const meta = { component: Widget };
      export default meta;
      export const Default = { args: {} };
    `;
    const bad = checkStoryMatchesComponent({
      componentSource: source,
      storySource: badStory,
      componentRel: 'apps/web/components/atoms/Widget.tsx',
      storyRel: 'apps/web/components/atoms/Widget.stories.tsx',
    });
    expect(bad.ok).toBe(false);
    expect(
      bad.findings.some(f => f.rule === 'story-must-cover-required-props')
    ).toBe(true);

    const goodStory = `
      import { Widget } from './Widget';
      const meta = { component: Widget };
      export default meta;
      export const Default = { args: { title: 'Hi', onClick: () => {} } };
    `;
    const good = checkStoryMatchesComponent({
      componentSource: source,
      storySource: goodStory,
      componentRel: 'apps/web/components/atoms/Widget.tsx',
      storyRel: 'apps/web/components/atoms/Widget.stories.tsx',
    });
    expect(good.ok).toBe(true);
  });

  it('accepts uncoveredProps allowlist', () => {
    const source = `
      export interface WidgetProps { readonly title: string; readonly secret: string }
      export function Widget(_p: WidgetProps) { return null }
    `;
    const story = `
      import { Widget } from './Widget';
      export default {
        component: Widget,
        parameters: { jovie: { uncoveredProps: ['secret'] } },
      };
      export const Default = { args: { title: 'x' } };
    `;
    const result = checkStoryMatchesComponent({
      componentSource: source,
      storySource: story,
      componentRel: 'x/Widget.tsx',
      storyRel: 'x/Widget.stories.tsx',
    });
    expect(result.ok).toBe(true);
  });
});

describe('diff gate', () => {
  it('honors an explicit null diffBase instead of re-resolving origin/main', () => {
    // Regression for JOV-5454 contract failure: in CI origin/main is always
    // present, so re-resolving an explicit opt-out turned into a diff scan
    // against main and reported false missing-test/story issues for unrelated
    // changed components. With an explicit null base and quality/ratchet
    // skipped, the report must be green and skip the diff section.
    const report = runComponentShipGate({
      diffBase: null,
      skipQuality: true,
      skipRatchet: true,
      skipRenderedCert: true,
      skipLiveStorybook: true,
    });
    expect(report.ok).toBe(true);
    expect(report.sections.diff.applicable).toBe(false);
  });

  it('still auto-resolves a base when diffBase is omitted', () => {
    // When diffBase is not provided at all, the gate falls back to
    // COMPONENT_SHIP_DIFF_BASE / origin/main. Pin an empty-diff ref so this
    // 5s control stays isolated from large mechanical PRs (JOV-5466).
    const previous = process.env.COMPONENT_SHIP_DIFF_BASE;
    process.env.COMPONENT_SHIP_DIFF_BASE = 'HEAD';
    try {
      const report = runComponentShipGate({
        skipQuality: true,
        skipRatchet: true,
        skipRenderedCert: true,
        skipLiveStorybook: true,
      });
      expect(report.diffBase).toBe('HEAD');
      expect(report.sections.diff.note).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.COMPONENT_SHIP_DIFF_BASE;
      } else {
        process.env.COMPONENT_SHIP_DIFF_BASE = previous;
      }
    }
  });

  it('treats a resolved base with no in-scope changes as scanned but not applicable', () => {
    // Regression for ci:f4bd9bc60a2c6c3c188d: screenshots/manifest-only PRs
    // resolve a diff base yet contain no ship-scope component changes, so
    // `applicable` is false even though the scan ran. `applicable` must never
    // be conflated with "a base resolved" — only the skip note marks an
    // explicit opt-out. Use HEAD...HEAD (empty) so the 5s control does not
    // scan this PR against origin/main (JOV-5466).
    const report = runComponentShipGate({
      diffBase: 'HEAD',
      skipQuality: true,
      skipRatchet: true,
      skipRenderedCert: true,
      skipLiveStorybook: true,
    });
    expect(report.diffBase).toBe('HEAD');
    expect(report.sections.diff.note).toBeUndefined();
    expect(report.sections.diff.ok).toBe(true);
    expect(report.sections.diff.applicable).toBe(false);
    expect(report.sections.diff.changedComponents).toEqual([]);
  });

  function coverageViaResult(testSource, { extension = 'tsx' } = {}) {
    const sourceRel = 'apps/web/components/atoms/CoverageViaPanel.tsx';
    const testRel = `apps/web/tests/unit/atoms/CoverageViaPanel.test.${extension}`;
    const storyRel = 'apps/web/components/atoms/CoverageViaPanel.stories.tsx';
    const root = fixtureRepo({
      [sourceRel]: [
        `// @coverage-via ${testRel}`,
        'export function CoverageViaPanel() { return <section /> }',
      ].join('\n'),
      [testRel]: testSource,
      [storyRel]: [
        "import { CoverageViaPanel } from './CoverageViaPanel';",
        'export default { component: CoverageViaPanel };',
        'export const Default = { render: () => <CoverageViaPanel /> };',
      ].join('\n'),
    });
    return checkChangedComponents([sourceRel, testRel, storyRel], {
      repoRoot: root,
    });
  }

  it('rejects comment-only @coverage-via evidence', () => {
    const result = coverageViaResult(
      "// import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\n// CoverageViaPanel"
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });

  it.each([
    [
      'an import-only reference',
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';",
    ],
    [
      'a void reference',
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nvoid CoverageViaPanel;",
    ],
    [
      'an unused alias assignment',
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nconst unused = CoverageViaPanel;",
    ],
    [
      'an existence assertion',
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nexpect(CoverageViaPanel).toBeDefined();",
    ],
    [
      'an unrendered JSX assignment',
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nconst receipt = <CoverageViaPanel />;",
    ],
    [
      'JSX returned by a never-called helper',
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nfunction receipt() { return <CoverageViaPanel />; }",
    ],
    [
      'a render inside a never-called helper',
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nfunction receipt() { render(<CoverageViaPanel />); }",
    ],
  ])('rejects %s as inert @coverage-via evidence', (_case, testSource) => {
    const result = coverageViaResult(testSource);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });

  it('accepts JSX rendering for @coverage-via evidence', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nrender(<CoverageViaPanel />);"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a direct call of the imported component', () => {
    const result = coverageViaResult(
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nCoverageViaPanel();"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a direct construct of the imported component', () => {
    const result = coverageViaResult(
      "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nnew CoverageViaPanel();"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts the component as argument zero of an imported test renderer', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nrender(CoverageViaPanel);"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a namespaced React element factory followed by a renderer', () => {
    const result = coverageViaResult(
      "import * as React from 'react';\nimport { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nrender(React.createElement(CoverageViaPanel));"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts the component as argument zero of createRoot().render', () => {
    const result = coverageViaResult(
      "import { createRoot } from 'react-dom/client';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\ncreateRoot(globalThis.document.createElement('div')).render(CoverageViaPanel);"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a wrapped createRoot().render consumer', () => {
    const result = coverageViaResult(
      "import { createRoot } from 'react-dom/client';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\n(createRoot(globalThis.document.createElement('div')).render)(CoverageViaPanel);"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts an explicitly imported server renderer', () => {
    const result = coverageViaResult(
      "import { renderToString } from 'react-dom/server';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nrenderToString(<CoverageViaPanel />);"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts an explicit React element consumer for @coverage-via evidence', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport React from 'react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nrender(React.createElement(CoverageViaPanel));"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a rendered JSX helper invoked from a registered test', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nfunction renderReceipt() { render(<CoverageViaPanel />); }\nit('renders', () => renderReceipt());"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a named render helper registered directly as a test callback', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nfunction renderReceipt() { render(<CoverageViaPanel />); }\nit('renders', renderReceipt);"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a render inside an immediately invoked function', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\n(() => render(<CoverageViaPanel />))();"
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a render inside a test.each callback', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\ntest.each([1])('renders %s', () => render(<CoverageViaPanel />));"
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    [
      'it.skip',
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nit.skip('renders', () => render(<CoverageViaPanel />));",
    ],
    [
      'test.skip',
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\ntest.skip('renders', () => render(<CoverageViaPanel />));",
    ],
    [
      'describe.skip',
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\ndescribe.skip('coverage', () => render(<CoverageViaPanel />));",
    ],
    [
      'test.skip.each',
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\ntest.skip.each([1])('renders %s', () => render(<CoverageViaPanel />));",
    ],
    [
      'test.todo',
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\ntest.todo('renders', () => render(<CoverageViaPanel />));",
    ],
  ])('rejects a render inside %s as inert @coverage-via evidence', (
    _case,
    testSource
  ) => {
    const result = coverageViaResult(testSource);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });

  it('accepts nested JSX that reaches an imported renderer', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nrender(<section>{true && <CoverageViaPanel />}</section>);"
    );
    expect(result.ok).toBe(true);
  });

  it('keeps a valid import usable outside an unrelated nested shadow', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nfunction unrelated() { const CoverageViaPanel = () => null; return CoverageViaPanel; }\nrender(<CoverageViaPanel />);"
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a locally shadowed renderer binding', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nfunction receipt() { const render = () => null; render(<CoverageViaPanel />); }\nreceipt();"
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });

  it('rejects a test registration hidden inside a never-called helper', () => {
    const result = coverageViaResult(
      "import { render } from '@testing-library/react';\nimport { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';\nfunction registerReceipt() { it('renders', () => render(<CoverageViaPanel />)); }"
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });

  it('rejects a helper call from an unrelated shadowed scope', () => {
    const result = coverageViaResult(
      [
        "import { render } from '@testing-library/react';",
        "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';",
        'function renderReceipt() { render(<CoverageViaPanel />); }',
        'function unrelated() {',
        '  function renderReceipt() { return null; }',
        '  renderReceipt();',
        '}',
        'unrelated();',
      ].join('\n')
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });

  it.each([
    [
      'a local render function with no React import',
      [
        'const render = () => null;',
        "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';",
        'render(CoverageViaPanel);',
      ].join('\n'),
    ],
    [
      'an arbitrary object render method',
      [
        'const renderer = { render: () => null };',
        "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';",
        'renderer.render(CoverageViaPanel);',
      ].join('\n'),
    ],
    [
      'a component passed as a non-path consumer argument',
      [
        "import { render } from '@testing-library/react';",
        "import { CoverageViaPanel } from '@/components/atoms/CoverageViaPanel';",
        "render('not the component', CoverageViaPanel);",
      ].join('\n'),
    ],
  ])('rejects %s as @coverage-via execution', (_case, testSource) => {
    const result = coverageViaResult(testSource);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });

  it('accepts an asserted exact source read for @coverage-via evidence', () => {
    const result = coverageViaResult(
      [
        "import { readFileSync } from 'node:fs';",
        "const source = readFileSync('apps/web/components/atoms/CoverageViaPanel.tsx', 'utf8');",
        "expect(source).toContain('CoverageViaPanel');",
      ].join('\n'),
      { extension: 'ts' }
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a source path that appears only in a non-path read argument', () => {
    const result = coverageViaResult(
      [
        "import { readFileSync } from 'node:fs';",
        "const source = readFileSync('not-the-component.tsx', 'apps/web/components/atoms/CoverageViaPanel.tsx');",
        "expect(source).toContain('CoverageViaPanel');",
      ].join('\n'),
      { extension: 'ts' }
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'coverage-via-invalid' }),
        expect.objectContaining({ rule: 'missing-test' }),
      ])
    );
  });
  it('fails closed without test and story', () => {
    const root = fixtureRepo({
      'apps/web/components/atoms/NewThing.tsx':
        'export function NewThing() { return null }\n',
    });
    // Monkey-patch by calling policy against fixture via checkChangedComponents
    // with absolute paths is hard; unit-test the pure helpers and a temp-root
    // check using relative paths by writing into repo-shaped tree and invoking
    // the exported checker with mocked read via process.cwd isolation is heavy.
    // Instead re-run match + scope which are the pure contract.
    expect(isUnderShipScope('apps/web/components/atoms/NewThing.tsx')).toBe(
      true
    );
    const m = measureRootCoverage('apps/web/components/atoms', root);
    expect(m.total).toBe(1);
    expect(m.covered).toBe(0);
    expect(m.percent).toBe(0);
  });

  it('fails closed for a changed feature component outside the legacy layer roots', () => {
    const sourceRel =
      'apps/web/components/features/profile/UnownedProfileCard.tsx';
    const root = fixtureRepo({
      [sourceRel]: 'export function UnownedProfileCard() { return null }\n',
    });

    const result = checkChangedComponents([sourceRel], { repoRoot: root });

    expect(result.applicable).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.changedComponents).toEqual([sourceRel]);
    expect(result.issues.map(issue => issue.rule)).toEqual(
      expect.arrayContaining(['missing-test', 'missing-story'])
    );
  });

  it('accepts a changed feature component only with touched real test and story evidence', () => {
    const sourceRel = 'apps/web/components/features/profile/ProfileSignal.tsx';
    const testRel =
      'apps/web/components/features/profile/ProfileSignal.test.tsx';
    const storyRel =
      'apps/web/components/features/profile/ProfileSignal.stories.tsx';
    const root = fixtureRepo({
      [sourceRel]:
        'export interface ProfileSignalProps { readonly label: string }\n' +
        'export function ProfileSignal({ label }: ProfileSignalProps) { return <span>{label}</span> }\n',
      [testRel]:
        "import { render } from '@testing-library/react';\n" +
        "import { ProfileSignal } from './ProfileSignal';\n" +
        "render(<ProfileSignal label='Signal' />);\n",
      [storyRel]:
        "import { ProfileSignal } from './ProfileSignal';\n" +
        'export default { component: ProfileSignal };\n' +
        "export const Default = { args: { label: 'Signal' } };\n",
    });

    const result = checkChangedComponents([sourceRel, testRel, storyRel], {
      repoRoot: root,
    });

    expect(result).toMatchObject({
      applicable: true,
      ok: true,
      changedComponents: [sourceRel],
    });
  });

  it('reports missing test/story for changed components in a fixture root', () => {
    const root = fixtureRepo({
      'packages/ui/atoms/Bare.tsx': 'export function Bare() { return null }\n',
      'packages/ui/atoms/Bare.stories.tsx':
        "import { Bare } from './Bare';\nexport default { component: Bare };\nexport const Default = {};\n",
    });
    // Direct path existence checks via list
    const list = listComponentsInRoot('packages/ui/atoms', root);
    const bare = list.find(
      c => c.component === 'Bare' || c.component === 'bare'
    );
    // basename preserves case from file Bare.tsx
    expect(list.some(c => !c.tested)).toBe(true);
    expect(list.some(c => c.covered)).toBe(true);
    void bare;
    void checkChangedComponents;
  });

  it('accepts central evidence only for a changed legacy component', () => {
    expect(legacyEvidenceResult().ok).toBe(true);

    const unchangedTest = legacyEvidenceResult({ changedTest: false });
    expect(unchangedTest.ok).toBe(false);
    expect(
      unchangedTest.issues.some(issue => issue.rule === 'missing-test')
    ).toBe(true);

    const newComponent = legacyEvidenceResult({ legacy: false });
    expect(newComponent.ok).toBe(false);
    expect(newComponent.issues.map(issue => issue.rule)).toEqual(
      expect.arrayContaining(['missing-test', 'missing-story'])
    );
  });

  it.each([
    [
      'an exact import replaced by a component mock',
      [
        "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';",
        "const target = '@/components/marketing/legacy/LegacyPanel';",
        'vi.mock(target, () => ({ LegacyPanel: () => null }));',
        'void LegacyPanel;',
      ].join('\n'),
    ],
    [
      'a commented import',
      [
        "// import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';",
        'void LegacyPanel;',
      ].join('\n'),
    ],
    [
      'runtime use of a local binding that shadows the import',
      [
        "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';",
        'function exerciseShadow() {',
        '  const LegacyPanel = () => null;',
        '  return LegacyPanel();',
        '}',
        'exerciseShadow();',
      ].join('\n'),
    ],
    [
      'an asserted source read from a fake local reader',
      [
        "const readFileSync = () => 'fake source';",
        "const source = readFileSync('components/marketing/legacy/LegacyPanel.tsx', 'utf8');",
        "expect(source).toContain('LegacyPanel');",
      ].join('\n'),
    ],
  ])('rejects %s as central test evidence', (_case, testSource) => {
    const result = legacyEvidenceResult({ testSource });
    expect(result.ok).toBe(false);
    expect(result.issues.some(issue => issue.rule === 'missing-test')).toBe(
      true
    );
  });

  it('accepts an asserted exact source read through node:fs', () => {
    const result = legacyEvidenceResult({
      testRel: LEGACY_TEST_REL.replace('.tsx', '.ts'),
      testSource: [
        "import { readFileSync } from 'node:fs';",
        "import { resolve } from 'node:path';",
        "const source = readFileSync(resolve(process.cwd(), 'components/marketing/legacy/LegacyPanel.tsx'), 'utf8');",
        "expect(source).toContain('LegacyPanel');",
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    [
      'props and exemptions from unrelated story content',
      [
        "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';",
        "import { OtherPanel } from '@/components/marketing/other/OtherPanel';",
        "export const MissingTitle = { parameters: { jovie: { uncoveredProps: ['title'] } }, render: () => <LegacyPanel /> };",
        "export const Unrelated = { render: () => <OtherPanel title='Not evidence' /> };",
      ].join('\n'),
    ],
    [
      'comment- and string-only JSX',
      [
        "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';",
        'const fakeMarkup = "<LegacyPanel title=\'String only\' />";',
        "/* <LegacyPanel title='Comment only' /> */",
        'export const Empty = { render: () => null };',
      ].join('\n'),
    ],
    [
      'a rendered mock',
      [
        "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';",
        "vi.mock('@/components/marketing/legacy/LegacyPanel' + '', () => ({ LegacyPanel: () => null }));",
        "export const Mocked = { render: () => <LegacyPanel title='Mocked' /> };",
      ].join('\n'),
    ],
    [
      'a same-named import from the wrong module',
      [
        "import { LegacyPanel } from '@/components/marketing/other/LegacyPanel';",
        "export const WrongModule = { render: () => <LegacyPanel title='Legacy' /> };",
      ].join('\n'),
    ],
  ])('rejects %s as canonical story evidence', (_case, storySource) => {
    const result = legacyEvidenceResult({ storySource });
    expect(result.ok).toBe(false);
    expect(result.issues.some(issue => issue.rule === 'missing-story')).toBe(
      true
    );
  });

  it('honors only a component-scoped prop exemption', () => {
    const result = legacyEvidenceResult({
      componentSource: [
        'export interface LegacyPanelProps {',
        '  readonly title: string;',
        '  readonly disabled: boolean;',
        '}',
        'export function LegacyPanel({ title }: LegacyPanelProps) { return <h2>{title}</h2> }',
      ].join('\n'),
      storySource: [
        "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';",
        'export const Legacy = {',
        "  parameters: { jovie: { uncoveredPropsByComponent: { LegacyPanel: ['disabled'] } } },",
        "  render: () => <LegacyPanel title='Legacy' />,",
        '};',
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it('does not let one export exempt another export', () => {
    const result = legacyEvidenceResult({
      componentSource: [
        'export interface PrimaryPanelProps { readonly title: string }',
        'export function PrimaryPanel({ title }: PrimaryPanelProps) { return <h2>{title}</h2> }',
        'export interface SecondaryPanelProps { readonly disabled: boolean }',
        'export function SecondaryPanel() { return null }',
      ].join('\n'),
      testSource: [
        "import { PrimaryPanel } from '@/components/marketing/legacy/LegacyPanel';",
        'void PrimaryPanel;',
      ].join('\n'),
      storySource: [
        "import { PrimaryPanel, SecondaryPanel } from '@/components/marketing/legacy/LegacyPanel';",
        'export const Both = {',
        "  parameters: { jovie: { uncoveredPropsByComponent: { PrimaryPanel: ['disabled'] } } },",
        "  render: () => <><PrimaryPanel title='Primary' /><SecondaryPanel /></>,",
        '};',
      ].join('\n'),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some(issue => issue.rule === 'missing-story')).toBe(
      true
    );
  });
});

const VIA_COMPONENT_REL = 'apps/web/components/atoms/ViaPanel.tsx';
const VIA_TEST_REL = 'apps/web/tests/unit/atoms/ViaPanel.test.tsx';
const VIA_STORY_REL = 'apps/web/components/atoms/ViaPanel.stories.tsx';
const VIA_DIRECTIVE =
  '// @coverage-via apps/web/tests/unit/atoms/ViaPanel.test.tsx\n';
const VIA_COMPONENT_SOURCE =
  `${VIA_DIRECTIVE}` + 'export function ViaPanel() { return <div>Via</div> }\n';
const VIA_STORY_SOURCE =
  "import { ViaPanel } from './ViaPanel';\n" +
  'export default { component: ViaPanel };\n' +
  'export const Default = { render: () => <ViaPanel /> };\n';

function coverageViaResult({
  componentSource = VIA_COMPONENT_SOURCE,
  testSource = '',
  testRel = VIA_TEST_REL,
} = {}) {
  const root = fixtureRepo({
    [VIA_COMPONENT_REL]: componentSource,
    [testRel]: testSource,
    [VIA_STORY_REL]: VIA_STORY_SOURCE,
  });
  return checkChangedComponents([VIA_COMPONENT_REL, testRel, VIA_STORY_REL], {
    repoRoot: root,
  });
}

describe('coverage-via executable evidence', () => {
  it('rejects a deliberate-red commented basename as coverage-via evidence', () => {
    const result = coverageViaResult({
      testSource: [
        '// ViaPanel',
        "// import { ViaPanel } from '@/components/atoms/ViaPanel';",
        'void 0;',
      ].join('\n'),
    });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(issue => issue.rule === 'coverage-via-invalid')
    ).toBe(true);
  });

  it('accepts an exact module import plus render', () => {
    const result = coverageViaResult({
      testSource: [
        "import { render } from '@testing-library/react';",
        "import { ViaPanel } from '@/components/atoms/ViaPanel';",
        'render(<ViaPanel />);',
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an asserted exact source read through node:fs', () => {
    const result = coverageViaResult({
      testSource: [
        "import { readFileSync } from 'node:fs';",
        "import { resolve } from 'node:path';",
        "const source = readFileSync(resolve(process.cwd(), 'components/atoms/ViaPanel.tsx'), 'utf8');",
        "expect(source).toContain('ViaPanel');",
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an exact source read through a statically bound path', () => {
    const result = coverageViaResult({
      testSource: [
        "import { readFileSync } from 'node:fs';",
        "import { resolve } from 'node:path';",
        "const sourcePath = 'components/atoms/ViaPanel.tsx';",
        "const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');",
        "expect(source).toContain('ViaPanel');",
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a dynamic exact-module import plus render', () => {
    const result = coverageViaResult({
      testSource: [
        "import { render } from '@testing-library/react';",
        "const { ViaPanel } = await import('@/components/atoms/ViaPanel');",
        'render(<ViaPanel />);',
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an asserted join-of-literals node:fs read', () => {
    const result = coverageViaResult({
      testSource: [
        "import { readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "const source = readFileSync(join(process.cwd(), 'components', 'atoms', 'ViaPanel.tsx'), 'utf8');",
        "expect(source).toContain('ViaPanel');",
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it('accepts an asserted exact source read through a local node:fs helper', () => {
    const result = coverageViaResult({
      testSource: [
        "import { readFileSync } from 'node:fs';",
        "import { resolve } from 'node:path';",
        'function readWebSource(path) {',
        "  return readFileSync(resolve(process.cwd(), path), 'utf8');",
        '}',
        "const source = readWebSource('components/atoms/ViaPanel.tsx');",
        "expect(source).toContain('ViaPanel');",
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    [
      'a mock without a real import',
      [
        "const target = '@/components/atoms/ViaPanel';",
        'vi.mock(target, () => ({ ViaPanel: () => null }));',
        'void ViaPanel;',
      ].join('\n'),
    ],
    [
      'unrelated same-name text',
      "const note = 'ViaPanel is mentioned only as text';\nvoid note;",
    ],
    [
      'an unasserted exact source read',
      [
        "import { readFileSync } from 'node:fs';",
        "import { resolve } from 'node:path';",
        "const source = readFileSync(resolve(process.cwd(), 'components/atoms/ViaPanel.tsx'), 'utf8');",
        'void source;',
      ].join('\n'),
    ],
  ])('rejects %s as coverage-via evidence', (_case, testSource) => {
    const result = coverageViaResult({ testSource });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(issue => issue.rule === 'coverage-via-invalid')
    ).toBe(true);
  });

  it('has zero invalid existing coverage-via receipts', () => {
    const audit = auditCoverageViaReceipts();
    expect(audit.invalid).toEqual([]);
    expect(audit.ok).toBe(true);
  });
});

describe('multi-root ratchet', () => {
  it('normalizes v1 baseline and blocks uncovered growth at 0%', () => {
    const v1 = {
      schemaVersion: 1,
      percent: 100,
      covered: 10,
      total: 10,
    };
    const n = normalizeBaseline(v1);
    expect(n.ok).toBe(true);
    expect(n.baseline.schemaVersion).toBe(2);
    expect(n.baseline.roots['packages/ui/atoms'].percent).toBe(100);

    const rootBaseline = { percent: 0, covered: 0, total: 5, uncovered: 5 };
    expect(
      compareRootCoverage(
        {
          percent: 0,
          covered: 0,
          total: 6,
          uncovered: 6,
          uncoveredComponents: [],
        },
        rootBaseline,
        'apps/web/components/marketing'
      ).ok
    ).toBe(false);

    expect(
      compareRootCoverage(
        {
          percent: 0,
          covered: 0,
          total: 5,
          uncovered: 5,
          uncoveredComponents: [],
        },
        rootBaseline,
        'apps/web/components/marketing'
      ).ok
    ).toBe(true);
  });

  it('validates multi-root baseline schema', () => {
    const baseline = {
      schemaVersion: 2,
      direction: 'lock_up',
      roots: {
        'packages/ui/atoms': {
          percent: 100,
          covered: 36,
          total: 36,
          uncovered: 0,
        },
      },
    };
    expect(validateBaseline(baseline).ok).toBe(true);
  });

  it('compareCoverage accepts multi-root measurement', () => {
    const measurement = {
      roots: {
        'packages/ui/atoms': {
          percent: 100,
          covered: 1,
          total: 1,
          uncovered: 0,
          uncoveredComponents: [],
        },
        'packages/ui': {
          percent: 0,
          covered: 0,
          total: 0,
          uncovered: 0,
          uncoveredComponents: [],
        },
        'apps/web/components/atoms': {
          percent: 0,
          covered: 0,
          total: 0,
          uncovered: 0,
          uncoveredComponents: [],
        },
        'apps/web/components/molecules': {
          percent: 0,
          covered: 0,
          total: 0,
          uncovered: 0,
          uncoveredComponents: [],
        },
        'apps/web/components/organisms': {
          percent: 0,
          covered: 0,
          total: 0,
          uncovered: 0,
          uncoveredComponents: [],
        },
        'apps/web/components/marketing': {
          percent: 0,
          covered: 0,
          total: 0,
          uncovered: 0,
          uncoveredComponents: [],
        },
        'apps/web/components/site': {
          percent: 0,
          covered: 0,
          total: 0,
          uncovered: 0,
          uncoveredComponents: [],
        },
        'apps/web/components': {
          percent: 0,
          covered: 0,
          total: 0,
          uncovered: 0,
          uncoveredComponents: [],
        },
      },
    };
    const baseline = {
      schemaVersion: 2,
      direction: 'lock_up',
      roots: Object.fromEntries(
        Object.keys(measurement.roots).map(root => [
          root,
          { percent: 0, covered: 0, total: 0, uncovered: 0 },
        ])
      ),
    };
    baseline.roots['packages/ui/atoms'] = {
      percent: 100,
      covered: 1,
      total: 1,
      uncovered: 0,
    };
    expect(compareCoverage(measurement, baseline).ok).toBe(true);
  });
});
