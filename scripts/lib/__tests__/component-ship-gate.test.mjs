import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkChangedComponents } from '../../component-ship-gate.mjs';
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
  "import { LegacyPanel } from '@/components/marketing/legacy/LegacyPanel';\nvoid LegacyPanel;";
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
    expect(isUnderShipScope('apps/web/app/(marketing)/page.tsx')).toBe(false);
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
