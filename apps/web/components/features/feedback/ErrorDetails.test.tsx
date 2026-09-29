import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorDetails } from './ErrorDetails';

describe('ErrorDetails', () => {
  it('renders the error id and a sentence-case copy action', () => {
    render(
      <ErrorDetails
        error={Object.assign(new Error('Request timed out'), {
          digest: 'dashboard-timeout',
        })}
      />
    );

    expect(screen.getByText('Error ID: dashboard-timeout')).toBeInTheDocument();
    const copyButton = screen.getByRole('button', {
      name: 'Copy error details to clipboard',
    });
    expect(copyButton).toHaveTextContent('Copy error details');
  });

  it('copies the assembled error details to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ErrorDetails
        error={Object.assign(new Error('Request timed out'), {
          digest: 'dashboard-timeout',
        })}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy error details to clipboard' })
    );

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('Error ID: dashboard-timeout');
  });

  it('keeps the collapsible disclosure closed until toggled', () => {
    render(
      <ErrorDetails
        error={Object.assign(new Error('Request timed out'), {
          digest: 'dashboard-timeout',
        })}
        collapsible
      />
    );

    const summary = screen.getByText('Error details');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');

    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
  });
});
