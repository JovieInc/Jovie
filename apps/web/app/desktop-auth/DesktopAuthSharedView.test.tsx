import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  DesktopAuthCancelButton,
  DesktopAuthHeading,
  DesktopAuthStatus,
} from './DesktopAuthSharedView';

function renderSharedView({
  copy = 'Continue in your browser, then return to Jovie.',
  status = null as string | null,
  onCancel = vi.fn(),
} = {}) {
  const view = render(
    <main>
      <DesktopAuthHeading copy={copy} />
      <DesktopAuthStatus id='desktop-auth-status' text={status} />
      <DesktopAuthCancelButton onCancel={onCancel} />
    </main>
  );
  return { ...view, onCancel };
}

describe('DesktopAuthSharedView', () => {
  it('renders the fixed heading above the method copy', async () => {
    const { container } = renderSharedView();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Finish Signing In' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Continue in your browser, then return to Jovie.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps an empty polite status region mounted before any status exists', async () => {
    const { container } = renderSharedView({ status: null });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('id', 'desktop-auth-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
    expect(status).toHaveClass('min-h-10');
    await expectNoA11yViolations(container);
  });

  it('announces a status in the same region without remounting it', async () => {
    const { container, rerender } = renderSharedView();
    const status = screen.getByRole('status');

    rerender(
      <main>
        <DesktopAuthHeading copy='Continue in your browser, then return to Jovie.' />
        <DesktopAuthStatus
          id='desktop-auth-status'
          text='The browser did not open. Try again, or copy the sign-in link.'
        />
        <DesktopAuthCancelButton onCancel={vi.fn()} />
      </main>
    );

    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(
      'The browser did not open. Try again, or copy the sign-in link.'
    );
    await expectNoA11yViolations(container);
  });

  it('cancels sign-in from the link button by pointer and keyboard', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderSharedView();
    const cancel = screen.getByRole('button', { name: 'Cancel Sign-in' });

    expect(cancel).toHaveAttribute('type', 'button');
    expect(cancel).toHaveAttribute('data-auth-action', 'cancel');
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.tab();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('wraps long and right-to-left copy without dropping any of it', async () => {
    const longCopy =
      'Signed in but Jovie did not open? Enter the code shown in your browser or on your phone, or copy the sign-in link into any browser on this Mac.';
    const { container } = render(
      <main dir='rtl' lang='ar'>
        <DesktopAuthHeading copy={longCopy} />
        <DesktopAuthStatus id='status' text='تحقق من المتصفح.' />
      </main>
    );

    expect(screen.getByText(longCopy)).toHaveClass('max-w-80');
    expect(screen.getByRole('status')).toHaveTextContent('تحقق من المتصفح.');
    await expectNoA11yViolations(container);
  });
});
