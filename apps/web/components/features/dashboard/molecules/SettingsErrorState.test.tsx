import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { expectFlatState } from '@/tests/utils/flat-state';
import { SettingsErrorState } from './SettingsErrorState';

describe('SettingsErrorState', () => {
  it('sits flat with no card, fill, border or shadow', () => {
    const { container } = render(<SettingsErrorState onRetry={vi.fn()} />);

    expectFlatState(container);
    expect(container.firstElementChild).toHaveClass('text-center');
  });

  it('shows the default copy with no retry', async () => {
    const { container } = render(<SettingsErrorState />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to load this section.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('retries when Try Again is pressed', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <SettingsErrorState
        title='Could not load notifications'
        message='Check your connection and try again.'
        onRetry={onRetry}
      />
    );

    expect(
      screen.getByText('Could not load notifications')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps the default title with only a custom message', async () => {
    const { container } = render(
      <SettingsErrorState message='Billing details are unavailable right now.' />
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('Billing details are unavailable right now.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left copy accessible', async () => {
    const title =
      'We could not load the connected streaming platforms for this profile';
    const { container } = render(
      <div dir='rtl'>
        <SettingsErrorState title={title} message='تعذر تحميل هذا القسم.' />
      </div>
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText('تعذر تحميل هذا القسم.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
