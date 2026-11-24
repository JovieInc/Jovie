import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceTableLoadingShell } from './AudienceTableLoadingShell';

describe('AudienceTableLoadingShell', () => {
  it('announces itself as a busy Audience region', () => {
    render(<AudienceTableLoadingShell />);
    const shell = screen.getByTestId('dashboard-audience-loading');
    expect(shell).toHaveAttribute('aria-busy', 'true');
    expect(shell).toHaveAttribute('aria-label', 'Loading Audience');
  });

  it('keeps the skeleton table header columns named for assistive tech', () => {
    render(<AudienceTableLoadingShell />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(header.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('stays inert while loading: a click on the shell changes nothing', async () => {
    const user = userEvent.setup();
    const { container } = render(<AudienceTableLoadingShell />);
    const shell = screen.getByTestId('dashboard-audience-loading');
    await user.click(shell);
    expect(shell).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AudienceTableLoadingShell />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('lays the skeleton table out in the compact row mode', () => {
    const { container } = render(<AudienceTableLoadingShell />);
    const modeNodes = container.querySelectorAll('[data-table-row-mode]');
    expect(modeNodes.length).toBeGreaterThan(0);
    for (const node of modeNodes) {
      expect(node).toHaveAttribute('data-table-row-mode', 'compact');
    }
  });
});
