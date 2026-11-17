import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NoirIonWorkspaceStatesSpecimen } from './NoirIonWorkspaceStatesSpecimen';

describe('NoirIonWorkspaceStatesSpecimen certificate', () => {
  it('renders each row state once inside a labelled table, axe-clean', async () => {
    const { container } = render(<NoirIonWorkspaceStatesSpecimen />);

    const table = screen.getByRole('table', {
      name: 'Workspace State Specimen',
    });
    const states = within(table)
      .getAllByRole('row')
      .map(row => row.getAttribute('data-state'))
      .filter(Boolean);
    expect(states).toEqual(['default', 'selected', 'focused', 'loading']);
    expect(
      within(table).getByText('Selected row').closest('tr')
    ).not.toHaveAttribute('aria-busy');
    expect(table.querySelector('[data-state="loading"]')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('reaches the toolbar controls and the focusable row by keyboard', async () => {
    const user = userEvent.setup();
    render(<NoirIonWorkspaceStatesSpecimen />);

    const focusables: (string | null)[] = [];
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      const active = document.activeElement as HTMLElement | null;
      focusables.push(
        active?.getAttribute('data-state') ??
          active?.getAttribute('aria-label') ??
          active?.textContent ??
          null
      );
    }
    expect(focusables).toContain('focused');
    expect(
      screen.getByRole('button', { name: 'Display options' })
    ).toBeInTheDocument();
  });

  it('stays axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <NoirIonWorkspaceStatesSpecimen />
      </div>
    );

    expect(
      screen.getByTestId('noir-ion-workspace-states-specimen')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
