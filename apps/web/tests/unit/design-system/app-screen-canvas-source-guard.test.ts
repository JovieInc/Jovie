import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_SCREEN_REGISTRY } from '@/data/appScreens';
import {
  type CanvasSourceInput,
  findUnauthorizedCanvasSources,
  findUnboundCanvasRouteAllowances,
} from './app-screen-canvas-source-guard';

const root = path.resolve(__dirname, '../../../../..');
const fixtureRoot = 'apps/web/components/features/fixture';
const appFixtureRoot = 'apps/web/app/app/(shell)/fixture';
const sourceRoots = 'app components contexts hooks lib workflows'
  .split(' ')
  .map(dir => `apps/web/${dir}`);
const productionExtension = /\.(?:ts|tsx)$/;
const ignoredProductionSource =
  /\.d\.ts$|[./](?:test|spec|stories)\.[cm]?[tj]sx?$|\/(?:__tests__|fixtures)\//;
const productionSources = (
  sourceDir: string,
  sources: CanvasSourceInput[] = []
): CanvasSourceInput[] => {
  for (const entry of fs.readdirSync(path.join(root, sourceDir), {
    withFileTypes: true,
  })) {
    const sourcePath = path.posix.join(sourceDir, entry.name);
    if (entry.isDirectory()) productionSources(sourcePath, sources);
    if (
      entry.isFile() &&
      productionExtension.test(sourcePath) &&
      !ignoredProductionSource.test(sourcePath)
    ) {
      sources.push({
        path: sourcePath,
        source: fs.readFileSync(path.join(root, sourcePath), 'utf8'),
      });
    }
  }
  return sources;
};
const pageShellViolation = (source: string, enclosingFunction: string) =>
  expect.objectContaining({
    path: source,
    component: 'PageShell',
    enclosingFunction,
    reason: 'unauthorized-occurrence',
  });
const f = (name: string, source: string): CanvasSourceInput => ({
  path: name.startsWith('apps/') ? name : `${fixtureRoot}/${name}`,
  source,
});
const namedConsumer = (
  name: string,
  imported: string,
  from: string,
  component = imported
) =>
  f(
    `${name}.tsx`,
    `import { ${imported} } from './${from}'; export const ${name}=()=> <${component}/>;`
  );
const fixturePath = (name: string) => `${fixtureRoot}/${name}.tsx`;
const allowance = (source: string, enclosingFunction: string) => ({
  source,
  component: 'PageShell' as const,
  enclosingFunction,
});
const screenContract = (source: string, enclosingFunction: string) => ({
  canvasOwner: 'screen' as const,
  nestedSurfaceRoles: [],
  nestedCanvasAllowances: [allowance(source, enclosingFunction)],
});
describe('app screen canvas source guard', () => {
  it('runs against production app and component sources', () => {
    const files = sourceRoots.flatMap(sourceRoot =>
      productionSources(sourceRoot)
    );
    const exceptions = Object.fromEntries(
      APP_SCREEN_REGISTRY.map(screen => [screen.source, screen.canvas])
    );
    const allowances = APP_SCREEN_REGISTRY.flatMap(
      screen => screen.canvas.nestedCanvasAllowances
    );
    expect(findUnboundCanvasRouteAllowances(files, exceptions)).toEqual([]);
    expect(findUnauthorizedCanvasSources(files, allowances)).toEqual([]);
  });
  it('rejects an undeclared nested canvas and accepts canonical flattening', () => {
    expect(
      findUnauthorizedCanvasSources(
        [
          f('Unsafe.tsx', 'const Unsafe=()=> <PageShell/>;'),
          f('Flat.tsx', 'const Flat=()=> <PageShell frame=\"none\"/>;'),
          f('Table.tsx', 'const T=()=> <PageShell surfaceMode=\"table\"/>;'),
          f(
            'QualifiedSafe.tsx',
            'const UI={PageShell:()=>null};const Q=()=> <UI.PageShell/>;'
          ),
        ],
        []
      )
    ).toEqual([pageShellViolation(`${fixtureRoot}/Unsafe.tsx`, 'Unsafe')]);
  });
  it('traces canvas aliases through wrappers, exports, and marker-free modules', () => {
    const violations = findUnauthorizedCanvasSources(
      [
        f('Wrapper.tsx', 'export const WrappedCanvas = memo(PageShell);'),
        namedConsumer('WConsumer', 'WrappedCanvas', 'Wrapper'),
        f(
          'DashboardWorkspacePanel.tsx',
          `export { PageShell as Panel } from './PageShell';`
        ),
        namedConsumer('RConsumer', 'Panel', 'DashboardWorkspacePanel'),
        f('DefaultWrapper.tsx', 'export default memo(PageShell);'),
        f(
          'DConsumer.tsx',
          `import D from './DefaultWrapper';
          export const DConsumer=()=> <D/>;`
        ),
        f(
          'RootWrapper.tsx',
          `export const WrappedCanvas = memo(PageShell);
          export default WrappedCanvas;
          export const Shells = { Canvas: PageShell };`
        ),
        f('Barrel.ts', `export * from './RootWrapper';`),
        f(
          'SecondWrapper.tsx',
          `import { WrappedCanvas } from './Barrel';
          export const TwiceWrapped = memo(WrappedCanvas);`
        ),
        namedConsumer('MConsumer', 'TwiceWrapped', 'SecondWrapper'),
        f(
          'NConsumer.tsx',
          `import * as Shells from './RootWrapper';
          export const NConsumer=()=> <Shells.WrappedCanvas/>;`
        ),
        f(
          'DIConsumer.tsx',
          `import dynamic from 'next/dynamic';
          const DynamicCanvas = dynamic(() => import('./RootWrapper'));
          export const DIConsumer=()=> <DynamicCanvas/>;`
        ),
        namedConsumer('EMConsumer', 'Shells', 'RootWrapper', 'Shells.Canvas'),
      ],
      []
    );
    expect(violations).toEqual([
      pageShellViolation(fixturePath('WConsumer'), 'WConsumer'),
      pageShellViolation(fixturePath('RConsumer'), 'RConsumer'),
      pageShellViolation(fixturePath('DConsumer'), 'DConsumer'),
      pageShellViolation(fixturePath('NConsumer'), 'NConsumer'),
      pageShellViolation(fixturePath('DIConsumer'), 'DIConsumer'),
      pageShellViolation(fixturePath('EMConsumer'), 'EMConsumer'),
      pageShellViolation(fixturePath('MConsumer'), 'MConsumer'),
    ]);
  });
  it('traces conditional and logical canvas aliases', () => {
    const source = 'apps/web/components/features/fixture/Conditional.tsx';
    const violations = findUnauthorizedCanvasSources(
      [
        f(
          'Conditional.tsx',
          `export function Conditional({ enabled, fallback }) {
            const ConditionalCanvas = enabled ? PageShell : Fragment;
            const LogicalCanvas = fallback || PageShell;
            const GuardedCanvas = enabled && PageShell;
            const Shells = { Canvas: PageShell };
            const { Canvas } = Shells;
            const [ArrayCanvas] = [PageShell];
            return <>
              <ConditionalCanvas />
              <LogicalCanvas />
              <GuardedCanvas />
              <Shells.Canvas />
              <Canvas />
              <ArrayCanvas />
            </>;
          }`
        ),
      ],
      []
    );
    expect(violations).toEqual(
      Array.from({ length: 6 }, () => pageShellViolation(source, 'Conditional'))
    );
  });
  it('fails closed for dynamic props and aliased raw surface tokens', () => {
    const violations = findUnauthorizedCanvasSources(
      [
        f(
          'Dynamic.tsx',
          `export const Dynamic=({ props })=> <PageShell {...props}/>;`
        ),
        f(
          'RawSurface.tsx',
          `import { LINEAR_SURFACE as SURFACE } from '@/lib/design/tokens';
          export const raw = SURFACE.contentContainer;
          export const rawBracket = SURFACE['contentContainer'];`
        ),
      ],
      []
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'PageShell' }),
        expect.objectContaining({
          component: 'LINEAR_SURFACE.contentContainer',
        }),
      ])
    );
  });
  it('allows the canonical PageShell content panel forwarding adapter', () => {
    expect(
      findUnauthorizedCanvasSources(
        [
          f(
            'apps/web/components/organisms/PageShell.tsx',
            `export function PageShell({ panelProps }) {
              return <AppShellContentPanel {...panelProps} />;
            }`
          ),
        ],
        []
      )
    ).toEqual([]);
  });
  it('honors flattened props and allowances in createElement canvas calls', () => {
    const allowedSource = `${fixtureRoot}/CreateAllowed.tsx`;
    const dynamicSource = `${fixtureRoot}/CreateDynamicAllowed.tsx`;
    const aliasSource = `${fixtureRoot}/CreateAlias.tsx`;
    expect(
      findUnauthorizedCanvasSources(
        [
          f(
            'CreateFlat.tsx',
            `export function CreateFlat() {
              return React.createElement(PageShell, { frame: 'none' });
            }`
          ),
          f(
            'CreateAllowed.tsx',
            `export function CreateAllowed() {
              return React.createElement(PageShell);
            }`
          ),
          f(
            'CreateDynamicAllowed.tsx',
            `export const CreateDynamicAllowed=({ props })=> {
              return React.createElement(PageShell, props);
            }`
          ),
          f(
            'CreateAlias.tsx',
            `import { createElement as h } from 'react';
              const make = React.createElement;
              export function CreateAlias() {
                return <>{h(PageShell, null)}{make(PageShell, null)}</>;
              }`
          ),
        ],
        [
          allowance(allowedSource, 'CreateAllowed'),
          allowance(dynamicSource, 'CreateDynamicAllowed'),
        ]
      )
    ).toEqual([
      pageShellViolation(dynamicSource, 'CreateDynamicAllowed'),
      pageShellViolation(aliasSource, 'CreateAlias'),
      pageShellViolation(aliasSource, 'CreateAlias'),
    ]);
  });
  it('does not double-report an allowed dynamic canvas occurrence', () => {
    const dynamicSource = `${fixtureRoot}/DynamicAllowed.tsx`;
    expect(
      findUnauthorizedCanvasSources(
        [
          f(
            'DynamicAllowed.tsx',
            `export const DynamicAllowed=({ props })=> <PageShell {...props}/>;`
          ),
        ],
        [allowance(dynamicSource, 'DynamicAllowed')]
      )
    ).toEqual([pageShellViolation(dynamicSource, 'DynamicAllowed')]);
  });
  it('checks route allowance reachability edges', () => {
    const routeSource = `${appFixtureRoot}/page.tsx`;
    const nestedSource = `${appFixtureRoot}/TypeOnlyNested.tsx`;
    const dynamicRouteSource = `${appFixtureRoot}/dynamic/page.tsx`;
    const dynamicNestedSource = `${appFixtureRoot}/dynamic/DynamicNested.tsx`;
    expect(
      findUnboundCanvasRouteAllowances(
        [
          f(
            routeSource,
            `import type { TypeOnlyNestedProps } from './TypeOnlyNested';
            export default function FixturePage() { return null; }`
          ),
          f(
            nestedSource,
            `export interface TypeOnlyNestedProps { readonly id: string; }
            export function TypeOnlyNested() { return <PageShell />; }`
          ),
        ],
        {
          [routeSource]: screenContract(nestedSource, 'TypeOnlyNested'),
        }
      )
    ).toEqual([
      {
        routeSource,
        allowanceSource: nestedSource,
        reason: 'allowance-unreachable-from-route',
      },
    ]);
    expect(
      findUnboundCanvasRouteAllowances(
        [
          f(
            dynamicRouteSource,
            `import dynamic from 'next/dynamic';
            const DynamicNested = dynamic(() => import('./DynamicNested'));
            export default function FixturePage() { return <DynamicNested/>; }`
          ),
          f(
            dynamicNestedSource,
            `export function DynamicNested() { return <PageShell/>; }`
          ),
        ],
        {
          [dynamicRouteSource]: screenContract(
            dynamicNestedSource,
            'DynamicNested'
          ),
        }
      )
    ).toEqual([]);
  });
});
