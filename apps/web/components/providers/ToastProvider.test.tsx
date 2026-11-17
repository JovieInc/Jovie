import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/feedback';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const state = vi.hoisted(() => ({ pathname: '/app/chat' }));

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

import { ToastProvider } from './ToastProvider';

function SaveButton() {
  return (
    <button type='button' onClick={() => toast.success('Changes saved')}>
      Save
    </button>
  );
}

describe('ToastProvider (FeedbackProvider re-export)', () => {
  beforeEach(() => {
    state.pathname = '/app/chat';
    // sonner calls setPointerCapture, which jsdom does not implement.
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    toast.dismiss();
  });

  it('renders its children and shows a toast fired from inside the tree', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToastProvider>
        <main>
          <SaveButton />
        </main>
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Changes saved')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps public profile routes free of feedback chrome', async () => {
    state.pathname = '/timwhite';
    const { container } = render(
      <ToastProvider>
        <main>Profile</main>
      </ToastProvider>
    );

    expect(screen.getByRole('main')).toHaveTextContent('Profile');
    expect(container.querySelector('[data-sonner-toaster]')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
