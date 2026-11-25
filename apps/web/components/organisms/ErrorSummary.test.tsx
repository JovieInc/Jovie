import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ErrorSummary } from './ErrorSummary';

describe('ErrorSummary', () => {
  it('renders nothing without errors', () => {
    const { container } = render(<ErrorSummary errors={{}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('announces one error as plain text, focuses the alert and is axe-clean', async () => {
    const { container } = render(
      <ErrorSummary errors={{ name: 'Artist name is required' }} />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveFocus();
    expect(screen.getByText('Resolve Form Errors')).toBeInTheDocument();
    expect(
      screen.getByText(/Please fix the following error:/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('counts several errors and reports the clicked field', async () => {
    const user = userEvent.setup();
    const onFocusField = vi.fn();
    const { container } = render(
      <ErrorSummary
        errors={{ name: 'Name is required', handle: 'Handle is taken' }}
        onFocusField={onFocusField}
        title='Fix these'
      />
    );

    expect(screen.getByText('Fix these')).toBeInTheDocument();
    expect(
      screen.getByText(/Please fix the following 2 errors:/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Handle is taken' }));
    expect(onFocusField).toHaveBeenCalledWith('handle');
    await expectNoA11yViolations(container);
  });
});
