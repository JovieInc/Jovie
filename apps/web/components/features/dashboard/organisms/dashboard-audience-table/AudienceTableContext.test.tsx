import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AudienceTableStableProvider,
  AudienceTableVolatileProvider,
  useAudienceTableContext,
  useAudienceTableStableContext,
  useAudienceTableVolatileContext,
} from './AudienceTableContext';

function stableValue() {
  return {
    toggleSelect: vi.fn(),
    setOpenMenuRowId: vi.fn(),
    getContextMenuItems: () => [],
    onExportMember: vi.fn(),
    onBlockMember: vi.fn(),
    onViewProfile: vi.fn(),
    onSendNotification: vi.fn(),
    getTouringCity: () => null,
    hiddenMetadataColumns: {
      location: true,
      source: false,
      engagement: true,
      lastSeen: false,
    },
  };
}

function Consumer() {
  const ctx = useAudienceTableContext();
  return (
    <div>
      <p>selected: {ctx.selectedIds.size}</p>
      <p>open menu: {ctx.openMenuRowId ?? 'none'}</p>
      <button type='button' onClick={() => ctx.toggleSelect('member-2')}>
        Select member
      </button>
      <button type='button' onClick={() => ctx.setOpenMenuRowId(null)}>
        Close menu
      </button>
    </div>
  );
}

function StableOnly() {
  const { hiddenMetadataColumns } = useAudienceTableStableContext();
  return <p>location hidden: {String(hiddenMetadataColumns.location)}</p>;
}

function VolatileOnly() {
  const { openMenuRowId } = useAudienceTableVolatileContext();
  return <p>volatile menu: {openMenuRowId ?? 'none'}</p>;
}

describe('AudienceTableContext certificate', () => {
  it('combines the stable callbacks and volatile selection', async () => {
    const user = userEvent.setup();
    const stable = stableValue();
    const { container } = render(
      <AudienceTableStableProvider value={stable}>
        <AudienceTableVolatileProvider
          value={{ selectedIds: new Set(['member-1']), openMenuRowId: 'row-3' }}
        >
          <Consumer />
          <StableOnly />
          <VolatileOnly />
        </AudienceTableVolatileProvider>
      </AudienceTableStableProvider>
    );

    expect(screen.getByText('selected: 1')).toBeInTheDocument();
    expect(screen.getByText('open menu: row-3')).toBeInTheDocument();
    expect(screen.getByText('location hidden: true')).toBeInTheDocument();
    expect(screen.getByText('volatile menu: row-3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select member' }));
    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(stable.toggleSelect).toHaveBeenCalledWith('member-2');
    expect(stable.setOpenMenuRowId).toHaveBeenCalledWith(null);
    await expectNoA11yViolations(container);
  });

  it('throws a clear error outside the providers', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<StableOnly />)).toThrow(
      'useAudienceTableStableContext must be used within AudienceTableProviders'
    );
    expect(() =>
      render(
        <AudienceTableStableProvider value={stableValue()}>
          <Consumer />
        </AudienceTableStableProvider>
      )
    ).toThrow(
      'useAudienceTableVolatileContext must be used within AudienceTableProviders'
    );
    spy.mockRestore();
  });
});
