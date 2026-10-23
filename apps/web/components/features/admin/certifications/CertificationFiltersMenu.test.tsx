import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import { CertificationFiltersMenu } from './CertificationFiltersMenu';

const inventory = fixtureInventory();
function renderMenu(selected = false) {
  const callbacks = {
    onDomainChange: vi.fn(),
    onOwnerChange: vi.fn(),
    onFreshnessChange: vi.fn(),
    onBlockersChange: vi.fn(),
  };
  render(
    <CertificationFiltersMenu
      rows={inventory.rows.map((row, index) => ({
        ...row,
        owner: index ? 'Summer' : null,
      }))}
      domains={inventory.domains}
      domain={selected ? 'flows' : 'all'}
      owner={selected ? 'Summer' : 'all'}
      freshness={selected ? 'stale' : 'all'}
      blockers={selected ? 'blocked' : 'all'}
      {...callbacks}
    />
  );
  return callbacks;
}

describe('CertificationFiltersMenu', () => {
  it('counts active filters and disables unavailable domains', async () => {
    renderMenu(true);
    const trigger = screen.getByRole('button', {
      name: 'Certification Filters: Flows (4)',
    });
    expect(trigger).toHaveTextContent('Flows (4)');
    await userEvent.click(trigger);
    expect(
      screen.getByRole('menuitemradio', { name: 'Acquisition (Unavailable)' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Summer')).toHaveLength(1);
    expect(
      screen.getAllByRole('menuitemradio', { checked: true })
    ).toHaveLength(4);
  });

  it.each([
    ['Flows (2)', 'onDomainChange', 'flows'],
    ['Unassigned', 'onOwnerChange', 'unassigned'],
    ['Current Revision', 'onFreshnessChange', 'current'],
    ['No Blockers', 'onBlockersChange', 'clear'],
  ] as const)(
    'selects %s through its own callback',
    async (name, callback, value) => {
      const callbacks = renderMenu();
      await userEvent.click(
        screen.getByRole('button', { name: 'Certification Filters: Filters' })
      );
      await userEvent.click(screen.getByRole('menuitemradio', { name }));
      expect(callbacks[callback]).toHaveBeenCalledExactlyOnceWith(value);
      for (const [key, handler] of Object.entries(callbacks)) {
        if (key !== callback) expect(handler).not.toHaveBeenCalled();
      }
    }
  );
});
