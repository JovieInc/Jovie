import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardLayoutClient, {
  AuthShellWrapper,
  useTableMeta,
} from '../../../.storybook/dashboard-layout-client-mock';
import storybookConfig, {
  resolvePrivacyBoundaryShellAlias,
} from '../../../.storybook/main';
import { useTableMeta as useAppTableMeta } from '../../../contexts/TableMetaContext';

function TableMetaProbe() {
  const { tableMeta, setTableMeta } = useTableMeta();

  return (
    <button type='button' onClick={() => setTableMeta({ rowCount: 4 })}>
      {String(tableMeta.rowCount)}
    </button>
  );
}

describe('Storybook dashboard shell mock contract', () => {
  it('backs the AuthShellWrapper alias with the matching named export', async () => {
    const viteFinal = storybookConfig.viteFinal;
    expect(viteFinal).toBeTypeOf('function');
    if (!viteFinal) {
      throw new Error('Storybook must define viteFinal');
    }

    type ViteFinal = NonNullable<typeof viteFinal>;
    const storybookViteConfig = await viteFinal(
      { resolve: { alias: [] } } as Parameters<ViteFinal>[0],
      {} as Parameters<ViteFinal>[1]
    );
    const aliases = storybookViteConfig.resolve?.alias;

    expect(Array.isArray(aliases)).toBe(true);
    if (!Array.isArray(aliases)) {
      throw new Error('Storybook aliases must be normalized to an array');
    }

    const shellAliasIndex = aliases.findIndex(
      alias =>
        typeof alias.find === 'string' &&
        alias.find === '@/components/organisms/AuthShellWrapper'
    );
    const projectAliasIndex = aliases.findIndex(
      alias => typeof alias.find === 'string' && alias.find === '@'
    );
    const shellAlias = aliases[shellAliasIndex];

    expect(shellAliasIndex).toBeGreaterThanOrEqual(0);
    expect(projectAliasIndex).toBeGreaterThan(shellAliasIndex);
    expect(shellAlias?.replacement).toMatch(
      /\.storybook\/dashboard-layout-client-mock\.tsx$/
    );
    expect(AuthShellWrapper).toBe(DashboardLayoutClient);
    expect(shellAlias.customResolver).toBe(resolvePrivacyBoundaryShellAlias);
  });

  it('resolves only the exact privacy boundary importer to the real authenticated shell', () => {
    const boundary = resolve(
      process.cwd(),
      'app/app/(shell)/DashboardShellPrivacyBoundary.tsx'
    );
    const realShell = resolve(
      process.cwd(),
      'components/organisms/AuthShellWrapper.tsx'
    );
    const mock = resolve(
      process.cwd(),
      '.storybook/dashboard-layout-client-mock.tsx'
    );
    expect(resolvePrivacyBoundaryShellAlias(mock, boundary)).toBe(realShell);
    expect(
      resolvePrivacyBoundaryShellAlias(mock, `${boundary}?v=fixture`)
    ).toBe(realShell);
    expect(
      resolvePrivacyBoundaryShellAlias(mock, boundary.replaceAll('/', '\\'))
    ).toBe(realShell);
    expect(resolvePrivacyBoundaryShellAlias(mock, `${boundary}.other`)).toBe(
      mock
    );
    expect(
      resolvePrivacyBoundaryShellAlias(mock, '/another/consumer.tsx')
    ).toBe(mock);
    expect(resolvePrivacyBoundaryShellAlias(mock)).toBe(mock);
  });

  it('preserves table metadata context for aliased shell stories', () => {
    render(
      <AuthShellWrapper>
        <TableMetaProbe />
      </AuthShellWrapper>
    );

    const rowCount = screen.getByRole('button', { name: 'null' });
    fireEvent.click(rowCount);
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
  });

  it('provides the app TableMetaContext that real components read', () => {
    function AppConsumer() {
      const { tableMeta } = useAppTableMeta();
      return <span>{String(tableMeta.rowCount)}</span>;
    }
    render(
      <AuthShellWrapper>
        <AppConsumer />
      </AuthShellWrapper>
    );
    expect(screen.getByText('null')).toBeInTheDocument();
  });
});
