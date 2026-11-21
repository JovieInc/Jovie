import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminTableShell } from './AdminTableShell';

describe('AdminTableShell certificate', () => {
  it('renders only the body when no toolbar or footer is given', async () => {
    const { container } = render(
      <AdminTableShell testId='shell'>
        {() => <p>No creators yet.</p>}
      </AdminTableShell>
    );
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByText('No creators yet.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders toolbar and footer around the body', async () => {
    const { container } = render(
      <AdminTableShell toolbar={<div>Toolbar</div>} footer={<div>Footer</div>}>
        {() => <p>Rows</p>}
      </AdminTableShell>
    );
    expect(screen.getByText('Toolbar')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports an elevated header once the body scrolls', async () => {
    const { container } = render(
      <AdminTableShell>
        {({ headerElevated }) => (
          <div data-testid='scroller' data-elevated={String(headerElevated)}>
            Rows
          </div>
        )}
      </AdminTableShell>
    );
    const scroller = screen.getByTestId('scroller');
    expect(scroller).toHaveAttribute('data-elevated', 'false');
    scroller.scrollTop = 24;
    fireEvent.scroll(scroller);
    expect(screen.getByTestId('scroller')).toHaveAttribute(
      'data-elevated',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
