import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('stays a quiet label unless it is marked dynamic', async () => {
    const { container } = render(<StatusBadge>Queued</StatusBadge>);

    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('announces a dynamic error status politely with its icon', async () => {
    const { container } = render(
      <StatusBadge
        variant='red'
        dynamic
        icon={<svg aria-hidden='true' data-testid='status-icon' />}
      >
        Sync failed
      </StatusBadge>
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Sync failed');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('status-icon').parentElement).toHaveClass(
      'shrink-0'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and Arabic text in the shrinkable slot', async () => {
    const longText = 'Waiting on distributor approval for every territory';
    const { container } = render(
      <div>
        <StatusBadge variant='orange' size='sm'>
          {longText}
        </StatusBadge>
        <div dir='rtl' lang='ar'>
          <StatusBadge variant='green' size='lg'>
            مباشر
          </StatusBadge>
        </div>
      </div>
    );

    expect(screen.getByText(longText)).toHaveClass('min-w-0');
    expect(screen.getByText('مباشر')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
