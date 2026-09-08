import fs, { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_CANVAS_DEFAULT_CONTRACT,
  APP_SCREEN_CANVAS_EXCEPTIONS,
  APP_SCREEN_CANVAS_MANIFEST_SCHEMA,
  APP_SCREEN_NESTED_SURFACE_ROLES,
  APP_SCREEN_REGISTRY,
  APP_SCREEN_SOURCES,
  type AppScreenCanvasContract,
  appScreenCanvasContract,
  validateAppScreenSystem,
} from '@/data/appScreens';
import {
  type CanvasSourceInput,
  findUnauthorizedCanvasSources,
  findUnboundCanvasRouteAllowances,
} from './app-screen-canvas-source-guard';

const repoRoot = path.resolve(__dirname, '../../../../..');

const INBOX_SOURCE = 'apps/web/app/app/(shell)/page.tsx';
const CALENDAR_SOURCE = 'apps/web/app/app/(shell)/calendar/page.tsx';

function readProductionTypeScriptFiles(directory: string): CanvasSourceInput[] {
  const files: CanvasSourceInput[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        [
          'node_modules',
          '.next',
          'coverage',
          'dist',
          'out',
          'storybook-static',
        ].includes(entry.name)
      ) {
        continue;
      }
      files.push(...readProductionTypeScriptFiles(absolutePath));
      continue;
    }
    if (
      !/\.tsx?$/.test(entry.name) ||
      /\.(?:test|stories)\.tsx?$/.test(entry.name)
    ) {
      continue;
    }
    files.push({
      path: path.relative(repoRoot, absolutePath).replaceAll('\\', '/'),
      source: readFileSync(absolutePath, 'utf8'),
    });
  }
  return files;
}

describe('app screen canvas-ownership manifest', () => {
  it('pins the schema version and nested surface roles', () => {
    expect(APP_SCREEN_CANVAS_MANIFEST_SCHEMA).toBe(
      'jovie.app-screens.canvas/v1'
    );
    expect([...APP_SCREEN_NESTED_SURFACE_ROLES]).toEqual([
      'navigation',
      'context',
      'module',
      'card',
    ]);
  });

  it('carries a canvas contract on every registry entry', () => {
    for (const entry of APP_SCREEN_REGISTRY) {
      expect(entry.canvas, entry.route).toEqual(
        appScreenCanvasContract(entry.source)
      );
    }
  });

  it('defaults every non-exception screen to shell-owned with no nested surfaces', () => {
    expect(APP_SCREEN_CANVAS_DEFAULT_CONTRACT).toEqual({
      canvasOwner: 'shell',
      nestedSurfaceRoles: [],
      nestedCanvasAllowances: [],
    });
    for (const entry of APP_SCREEN_REGISTRY) {
      if (entry.source in APP_SCREEN_CANVAS_EXCEPTIONS) continue;
      expect(entry.canvas, entry.route).toEqual(
        APP_SCREEN_CANVAS_DEFAULT_CONTRACT
      );
    }
  });

  it('keeps the calendar shell-owned while declaring its module surface', () => {
    const calendar = APP_SCREEN_REGISTRY.find(
      entry => entry.source === CALENDAR_SOURCE
    );
    expect(calendar?.canvas.canvasOwner).toBe('shell');
    expect(calendar?.canvas.nestedSurfaceRoles).toEqual(['module']);
    expect(calendar?.canvas.nestedCanvasAllowances).toEqual([]);
  });

  it('source-binds the current Inbox canvas until its repair removes both', () => {
    const inbox = APP_SCREEN_REGISTRY.find(
      entry => entry.source === INBOX_SOURCE
    );
    expect(inbox, 'Inbox route must be registered').toBeDefined();
    expect(APP_SCREEN_CANVAS_EXCEPTIONS[INBOX_SOURCE]).toEqual({
      canvasOwner: 'screen',
      nestedSurfaceRoles: [],
      nestedCanvasAllowances: [
        {
          source:
            'apps/web/components/features/opportunity-inbox/OpportunityInboxPageClient.tsx',
          component: 'PageShell',
          enclosingFunction: 'OpportunityInboxPageClient',
        },
      ],
      note: 'Legacy/demo holdover nested canvas — declared pending founder decision',
    });
    expect(inbox?.canvas).toEqual(APP_SCREEN_CANVAS_EXCEPTIONS[INBOX_SOURCE]);
  });

  it('keeps exceptions closed-world and source-backed on disk', () => {
    const knownSources = new Set<string>(APP_SCREEN_SOURCES);
    for (const [source, contract] of Object.entries(
      APP_SCREEN_CANVAS_EXCEPTIONS
    )) {
      expect(knownSources.has(source), source).toBe(true);
      for (const allowance of contract.nestedCanvasAllowances) {
        expect(
          fs.existsSync(path.join(repoRoot, allowance.source)),
          allowance.source
        ).toBe(true);
      }
    }
    expect(validateAppScreenSystem()).toEqual([]);
  });

  it('fails closed on unknown exception sources and incoherent ownership', () => {
    const codes = (
      canvasExceptions: Readonly<Record<string, AppScreenCanvasContract>>
    ) => validateAppScreenSystem({ canvasExceptions }).map(x => x.code);

    expect(
      codes({
        'apps/web/app/app/(shell)/not-a-screen/page.tsx':
          APP_SCREEN_CANVAS_DEFAULT_CONTRACT,
      })
    ).toContain('canvas-exception-unknown-source');

    expect(
      codes({
        [INBOX_SOURCE]: {
          canvasOwner: 'screen',
          nestedSurfaceRoles: [],
          nestedCanvasAllowances: [],
        },
      })
    ).toContain('screen-canvas-owner-without-sources');

    expect(
      codes({
        [INBOX_SOURCE]: {
          canvasOwner: 'shell',
          nestedSurfaceRoles: [],
          nestedCanvasAllowances: [
            {
              source: 'apps/web/app/app/(shell)/page.tsx',
              component: 'PageShell',
              enclosingFunction: 'InboxPage',
            },
          ],
        },
      })
    ).toContain('shell-canvas-owner-with-nested-sources');

    expect(
      codes({
        [INBOX_SOURCE]: {
          canvasOwner: 'screen',
          nestedSurfaceRoles: [],
          nestedCanvasAllowances: [
            {
              source: 'totally/not-a-path',
              component: 'PageShell',
              enclosingFunction: 'Fixture',
            },
          ],
        },
      })
    ).toContain('canvas-nested-source-not-tsx');

    const invalidAllowance = {
      source: INBOX_SOURCE,
      component: 'PageShell' as const,
      enclosingFunction: 'not stable',
    };
    const malformedCodes = codes({
      [INBOX_SOURCE]: {
        canvasOwner: 'screen',
        nestedSurfaceRoles: [],
        nestedCanvasAllowances: [invalidAllowance, invalidAllowance],
      },
    });
    expect(malformedCodes).toEqual(
      expect.arrayContaining([
        'canvas-nested-function-invalid',
        'canvas-nested-allowance-duplicate',
      ])
    );

    const runtimeMalformedCodes = codes({
      [INBOX_SOURCE]: {
        canvasOwner: 'route',
        nestedSurfaceRoles: ['module', 'module', 'violet-focus'],
        nestedCanvasAllowances: [
          {
            source: INBOX_SOURCE,
            component: 'Card',
            enclosingFunction: 'InboxPage',
          },
        ],
      } as unknown as AppScreenCanvasContract,
    });
    expect(runtimeMalformedCodes).toEqual(
      expect.arrayContaining([
        'canvas-owner-invalid',
        'canvas-nested-role-invalid',
        'canvas-nested-role-duplicate',
        'canvas-nested-component-invalid',
      ])
    );
  });

  it('deliberately rejects an unauthorized nested canvas source', () => {
    const violations = findUnauthorizedCanvasSources(
      [
        {
          path: 'apps/web/components/features/example/UnauthorizedCanvas.tsx',
          source: `export function Fixture() {
            return <PageShell frame='content-container'>Drift</PageShell>;
          }`,
        },
      ],
      []
    );

    expect(violations).toEqual([
      {
        path: 'apps/web/components/features/example/UnauthorizedCanvas.tsx',
        line: 2,
        component: 'PageShell',
        enclosingFunction: 'Fixture',
        reason: 'unauthorized-occurrence',
      },
    ]);
  });

  it('rejects implicit defaults while allowing a static flattening prop beside a dynamic sibling', () => {
    const path = 'apps/web/components/features/example/DynamicCanvas.tsx';
    const violations = findUnauthorizedCanvasSources(
      [
        {
          path,
          source: `export function Fixture({ frame, surfaceMode }) {
            return <>
              <PageShell>Implicit</PageShell>
              <PageShell frame={frame} surfaceMode='table'>Dynamic frame</PageShell>
              <PageShell frame='none' surfaceMode={surfaceMode}>Dynamic surface</PageShell>
            </>;
          }`,
        },
      ],
      []
    );

    expect(violations).toEqual([
      expect.objectContaining({
        path,
        line: 3,
        component: 'PageShell',
        enclosingFunction: 'Fixture',
        reason: 'unauthorized-occurrence',
      }),
    ]);
  });

  it('folds JSX canvas props and spreads from left to right', () => {
    const path = 'apps/web/components/features/example/SpreadCanvas.tsx';
    const violations = findUnauthorizedCanvasSources(
      [
        {
          path,
          source: `export function Fixture({ frame, surfaceMode, props }) {
            return <>
              <PageShell frame='none' {...props}>Unknown final frame</PageShell>
              <PageShell {...props} frame='none' surfaceMode={surfaceMode}>Final flat frame</PageShell>
              <PageShell surfaceMode='table' frame={frame}>Final table mode</PageShell>
              <PageShell surfaceMode='table' {...props}>Unknown final surface</PageShell>
              <PageShell {...props} surfaceMode='table'>Final table spread override</PageShell>
              <PageShell {...{ frame: 'none' }}>Static flat spread</PageShell>
              <PageShell {...{ frame: 'none' }} frame='content-container'>Static spread overridden</PageShell>
              <PageShell frame='none' {...{ title: 'safe' }}>Irrelevant static spread</PageShell>
            </>;
          }`,
        },
      ],
      []
    );

    expect(violations).toEqual([
      expect.objectContaining({ path, line: 3 }),
      expect.objectContaining({ path, line: 6 }),
      expect.objectContaining({ path, line: 9 }),
    ]);
  });

  it('deliberately rejects a second nested canvas in an otherwise authorized function', () => {
    const path = 'apps/web/components/features/example/AuthorizedCanvas.tsx';
    const violations = findUnauthorizedCanvasSources(
      [
        {
          path,
          source: `export function AuthorizedCanvas() {
            return <>
              <PageShell frame='content-container'>Approved occurrence</PageShell>
              <PageShell frame='content-container'>Unauthorized duplicate</PageShell>
            </>;
          }`,
        },
      ],
      [
        {
          source: path,
          component: 'PageShell',
          enclosingFunction: 'AuthorizedCanvas',
        },
      ]
    );

    expect(violations).toEqual([
      expect.objectContaining({
        path,
        line: 4,
        component: 'PageShell',
        enclosingFunction: 'AuthorizedCanvas',
        reason: 'unauthorized-occurrence',
      }),
    ]);
  });

  it('rejects aliases, member tags, factories, and dynamic authorized props', () => {
    const source = `
      import { PageShell as Shell } from './PageShell';
      const UI = { PageShell: Shell };
      export const DynamicAlias = ({ frame }) => <Shell frame={frame} />;
      export const MemberFixture = () => <UI.PageShell />;
      export const FactoryFixture = () => React.createElement(Shell);`;
    const violations = findUnauthorizedCanvasSources(
      [{ path: 'AliasFixture.tsx', source }],
      [
        {
          source: 'AliasFixture.tsx',
          component: 'PageShell',
          enclosingFunction: 'DynamicAlias',
        },
      ]
    );
    expect(violations.map(x => x.reason)).toEqual([
      'unauthorized-occurrence',
      'unauthorized-occurrence',
      'unauthorized-occurrence',
    ]);
  });

  it('deliberately rejects locally reassigned canvas primitives', () => {
    const violations = findUnauthorizedCanvasSources(
      [
        {
          path: 'LocalAliasFixture.tsx',
          source: `import { PageShell } from './PageShell';
            const Shell = PageShell;
            const NestedShell = Shell;
            export function Fixture() {
              return <NestedShell frame='content-container' />;
            }`,
        },
      ],
      []
    );
    expect(violations).toEqual([
      expect.objectContaining({
        path: 'LocalAliasFixture.tsx',
        component: 'PageShell',
        enclosingFunction: 'Fixture',
        reason: 'unauthorized-occurrence',
      }),
    ]);
  });

  it('rejects memo and generic HOC aliases, including named exports consumed cross-file', () => {
    const wrapperPath =
      'apps/web/components/features/example/CanvasWrappers.tsx';
    const consumerPath =
      'apps/web/components/features/example/CanvasConsumer.tsx';
    const violations = findUnauthorizedCanvasSources(
      [
        {
          path: wrapperPath,
          source: `import { PageShell } from '@/components/organisms/PageShell';
            export const MemoShell = memo(PageShell);
            export const ReactMemoShell = React.memo(PageShell);
            export const GuardedShell = withGuard(PageShell);`,
        },
        {
          path: consumerPath,
          source: `import { GuardedShell, MemoShell as LocalMemo, ReactMemoShell } from './CanvasWrappers';
            export function Fixture() {
              return <>
                <LocalMemo />
                <ReactMemoShell />
                <GuardedShell />
              </>;
            }`,
        },
      ],
      []
    );

    expect(violations).toEqual([
      expect.objectContaining({
        path: consumerPath,
        line: 4,
        component: 'PageShell',
        enclosingFunction: 'Fixture',
      }),
      expect.objectContaining({
        path: consumerPath,
        line: 5,
        component: 'PageShell',
        enclosingFunction: 'Fixture',
      }),
      expect.objectContaining({
        path: consumerPath,
        line: 6,
        component: 'PageShell',
        enclosingFunction: 'Fixture',
      }),
    ]);
  });

  it('rejects direct and aliased content-container tokens outside the canonical primitive', () => {
    const canonicalPath =
      'apps/web/components/organisms/AppShellContentPanel.tsx';
    const driftPath =
      'apps/web/components/features/example/RawContentContainer.tsx';
    const violations = findUnauthorizedCanvasSources(
      [
        {
          path: canonicalPath,
          source: `export function AppShellContentPanel() {
            return <div className={LINEAR_SURFACE.contentContainer} />;
          }`,
        },
        {
          path: driftPath,
          source: `import { LINEAR_SURFACE as SURFACE } from '@/components/tokens/linear-surface';
            const ALIASED_SURFACE = SURFACE;
            const { contentContainer: rawContainer } = ALIASED_SURFACE;
            export function Fixture() {
              return <div className={ALIASED_SURFACE.contentContainer ?? rawContainer} />;
            }`,
        },
      ],
      []
    );

    expect(violations).toEqual([
      expect.objectContaining({
        path: driftPath,
        line: 3,
        component: 'LINEAR_SURFACE.contentContainer',
        enclosingFunction: '<module>',
        reason: 'unauthorized-occurrence',
      }),
      expect.objectContaining({
        path: driftPath,
        line: 5,
        component: 'LINEAR_SURFACE.contentContainer',
        enclosingFunction: 'Fixture',
        reason: 'unauthorized-occurrence',
      }),
    ]);
  });

  it('binds each nested-canvas allowance to its declaring route graph', () => {
    const routeSource = 'apps/web/app/app/(shell)/fixture/page.tsx';
    const implementationSource =
      'apps/web/components/features/fixture/FixtureClient.tsx';
    const unrelatedSource =
      'apps/web/components/features/other/OtherClient.tsx';
    const contract = (allowanceSource: string): AppScreenCanvasContract => ({
      canvasOwner: 'screen',
      nestedSurfaceRoles: [],
      nestedCanvasAllowances: [
        {
          source: allowanceSource,
          component: 'PageShell',
          enclosingFunction: 'FixtureClient',
        },
      ],
    });
    const files = [
      {
        path: routeSource,
        source: `export { FixtureClient as default } from '@/components/features/fixture/FixtureClient';`,
      },
      {
        path: implementationSource,
        source: 'export function FixtureClient() {}',
      },
      { path: unrelatedSource, source: 'export function OtherClient() {}' },
    ];

    expect(
      findUnboundCanvasRouteAllowances(files, {
        [routeSource]: contract(implementationSource),
      })
    ).toEqual([]);
    expect(
      findUnboundCanvasRouteAllowances(files, {
        [routeSource]: contract(unrelatedSource),
      })
    ).toEqual([
      {
        routeSource,
        allowanceSource: unrelatedSource,
        reason: 'allowance-unreachable-from-route',
      },
    ]);
  });

  it('allows flattened, table-mode, and explicitly registered canvas sources', () => {
    const authorized =
      'apps/web/components/features/example/AuthorizedCanvas.tsx';
    expect(
      findUnauthorizedCanvasSources(
        [
          {
            path: 'apps/web/components/features/example/Flat.tsx',
            source: `<PageShell frame='none'>Flat</PageShell>`,
          },
          {
            path: 'apps/web/components/features/example/Table.tsx',
            source: `<PageShell frame='content-container' surfaceMode='table'>Table</PageShell>`,
          },
          {
            path: authorized,
            source: `<AppShellContentPanel>Declared</AppShellContentPanel>`,
          },
        ],
        [
          {
            source: authorized,
            component: 'AppShellContentPanel',
            enclosingFunction: '<module>',
          },
        ]
      )
    ).toEqual([]);
  });

  it('keeps every production nested canvas source manifest-authorized', () => {
    const allowances = Object.values(APP_SCREEN_CANVAS_EXCEPTIONS)
      .flatMap(contract => contract.nestedCanvasAllowances)
      .filter(
        (allowance, index, values) =>
          values.findIndex(
            candidate =>
              candidate.source === allowance.source &&
              candidate.component === allowance.component &&
              candidate.enclosingFunction === allowance.enclosingFunction
          ) === index
      );
    const files = [
      ...readProductionTypeScriptFiles(path.join(repoRoot, 'apps/web/app')),
      ...readProductionTypeScriptFiles(
        path.join(repoRoot, 'apps/web/components')
      ),
    ];

    expect(findUnauthorizedCanvasSources(files, allowances)).toEqual([]);
    expect(
      findUnboundCanvasRouteAllowances(files, APP_SCREEN_CANVAS_EXCEPTIONS)
    ).toEqual([]);
  }, 30_000);
});
