import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FormStatus } from './FormStatus';

function statusSlot(container: HTMLElement) {
  return container.querySelector('[data-slot="form-status"]');
}

describe('FormStatus', () => {
  it('renders an idle, polite live region with nothing in it', async () => {
    const { container } = render(<FormStatus />);

    const slot = statusSlot(container);
    expect(slot).toHaveAttribute('data-state', 'idle');
    expect(slot).toHaveAttribute('aria-live', 'polite');
    expect(slot).toHaveAttribute('aria-atomic', 'true');
    expect(slot).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('shows the processing line while loading', async () => {
    const { container } = render(<FormStatus loading />);

    expect(statusSlot(container)).toHaveAttribute('data-state', 'loading');
    expect(screen.getByText('Processing...')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('announces a trimmed error as an alert and drops the polite region', async () => {
    const { container } = render(
      <FormStatus error='  Something went wrong.  ' />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/^Something went wrong\.$/);
    expect(alert).toHaveClass('text-error');
    const slot = statusSlot(container);
    expect(slot).toHaveAttribute('data-state', 'error');
    expect(slot).not.toHaveAttribute('aria-live');
    await expectNoA11yViolations(container);
  });

  it('shows success in an output element', async () => {
    const { container } = render(<FormStatus success='Saved.' />);

    const output = screen.getByRole('status');
    expect(output.tagName).toBe('OUTPUT');
    expect(output).toHaveTextContent('Saved.');
    expect(statusSlot(container)).toHaveAttribute('data-state', 'success');
    await expectNoA11yViolations(container);
  });

  it('prefers loading over error for its state but still shows both', async () => {
    const { container } = render(
      <FormStatus loading error='Previous attempt failed.' />
    );

    expect(statusSlot(container)).toHaveAttribute('data-state', 'loading');
    expect(screen.getByText('Processing...')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Previous attempt failed.'
    );
    await expectNoA11yViolations(container);
  });

  it('ignores a whitespace-only error and shows the success line (partial)', async () => {
    const { container } = render(
      <FormStatus error='   ' success='Saved. Your profile is live.' />
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(statusSlot(container)).toHaveAttribute('data-state', 'success');
    expect(screen.getByText('Saved. Your profile is live.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps offline, long and RTL messages whole and axe-clean', async () => {
    const long =
      'We could not save your changes because the release date conflicts with an existing pre-save campaign. Pick another date or end the current campaign, then try again.';
    const { container } = render(
      <div dir='rtl'>
        <FormStatus error='You are offline. Reconnect to save your changes.' />
        <FormStatus error={long} />
        <FormStatus success='تم حفظ التغييرات بنجاح.' className='w-80' />
      </div>
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(
      'You are offline. Reconnect to save your changes.'
    );
    expect(alerts[1]).toHaveTextContent(long);
    expect(screen.getByText('تم حفظ التغييرات بنجاح.')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
