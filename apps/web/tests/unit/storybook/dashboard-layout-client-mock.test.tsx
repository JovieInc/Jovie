import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardLayoutClient, {
  AuthShellWrapper,
  useTableMeta,
} from '../../../.storybook/dashboard-layout-client-mock';
import storybookConfig from '../../../.storybook/main';

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
});
