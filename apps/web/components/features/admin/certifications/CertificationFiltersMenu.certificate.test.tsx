import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CertificationFiltersMenu } from './CertificationFiltersMenu';

const inventory = fixtureInventory();

function renderMenu(rows = inventory.rows) {
  const onOwnerChange = vi.fn();
  const view = render(
    <CertificationFiltersMenu
      rows={rows}
      domains={inventory.domains}
      domain='all'
      onDomainChange={vi.fn()}
      owner='all'
      onOwnerChange={onOwnerChange}
      freshness='all'
      onFreshnessChange={vi.fn()}
      blockers='all'
      onBlockersChange={vi.fn()}
    />
  );
  return { ...view, onOwnerChange };
}

describe('CertificationFiltersMenu certificate', () => {
  it('keeps the closed trigger axe-clean', async () => {
    const { container } = renderMenu();
    expect(
      screen.getByRole('button', { name: 'Certification Filters: Filters' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists long owner names sorted once and picks one, axe-clean while open', async () => {
    const user = userEvent.setup();
    const rows = inventory.rows.flatMap((row, index) => [
      { ...row, id: `${row.id}-a`, owner: `Working group ${index + 2}` },
      { ...row, id: `${row.id}-b`, owner: `Working group ${index + 2}` },
    ]);
    const { onOwnerChange } = renderMenu(rows);
    await user.click(
      screen.getByRole('button', { name: 'Certification Filters: Filters' })
    );
    const owners = screen
      .getAllByRole('menuitemradio')
      .map(item => item.textContent)
      .filter(text => text?.startsWith('Working group'));
    expect(owners).toEqual([...new Set(owners)].sort());
    await expectNoA11yViolations(screen.getByRole('menu'));
    await user.click(screen.getByRole('menuitemradio', { name: owners[0]! }));
    expect(onOwnerChange).toHaveBeenCalledExactlyOnceWith(owners[0]);
  });

  it('stays axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <CertificationFiltersMenu
          rows={[]}
          domains={[]}
          domain='all'
          onDomainChange={vi.fn()}
          owner='all'
          onOwnerChange={vi.fn()}
          freshness='all'
          onFreshnessChange={vi.fn()}
          blockers='all'
          onBlockersChange={vi.fn()}
        />
      </div>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Filters');
    await expectNoA11yViolations(container);
  });
});
