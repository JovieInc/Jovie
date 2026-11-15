import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableIssueSummary } from './TableIssueSummary';

describe('TableIssueSummary certificate', () => {
  it('opens a single issue in an axe-clean popover', async () => {
    const user = userEvent.setup();
    const { container, baseElement } = render(
      <TableIssueSummary issues={[{ label: 'No artwork' }]} />
    );

    const trigger = screen.getByRole('button', { name: 'View 1 issue' });
    expect(trigger).toHaveTextContent('1 issue');
    await expectNoA11yViolations(container);

    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Issues' });
    expect(screen.getByRole('listitem')).toHaveTextContent('No artwork');
    // AA contract: the row carries the WCAG-safe error text token
    // (text-error-text), not the raw accent red that fails 4.5:1 on the
    // elevated dark popover surface.
    expect(screen.getByRole('listitem')).toHaveClass('text-error-text');
    expect(dialog).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });

  it('pluralises the count and lists every issue', async () => {
    const user = userEvent.setup();
    render(
      <TableIssueSummary
        issues={[
          { label: 'No artwork' },
          { label: 'No providers' },
          { label: 'No UPC' },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'View 3 issues' }));
    await screen.findByRole('dialog', { name: 'Issues' });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows a dash without issues', async () => {
    const { container } = render(<TableIssueSummary issues={[]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with RTL labels', async () => {
    const { container } = render(
      <div dir='rtl'>
        <TableIssueSummary issues={[{ label: 'لا يوجد غلاف' }]} />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'View 1 issue' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
