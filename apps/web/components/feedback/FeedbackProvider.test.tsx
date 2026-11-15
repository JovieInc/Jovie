import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { banner } from './banner-store';
import { FeedbackProvider } from './FeedbackProvider';
import { toast } from './toast';

const { mockPathname } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => '/app/chat'),
}));

vi.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

function renderProvider() {
  return render(
    <FeedbackProvider>
      <main>
        <h1>Releases</h1>
      </main>
    </FeedbackProvider>
  );
}

// jsdom has no pointer capture; sonner's toast calls it on pointerdown.
const pointerCapture = {
  set: HTMLElement.prototype.setPointerCapture,
  release: HTMLElement.prototype.releasePointerCapture,
};

describe('FeedbackProvider certificate', () => {
  beforeAll(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterAll(() => {
    HTMLElement.prototype.setPointerCapture = pointerCapture.set;
    HTMLElement.prototype.releasePointerCapture = pointerCapture.release;
  });

  beforeEach(() => {
    mockPathname.mockReturnValue('/app/chat');
  });

  afterEach(() => {
    act(() => {
      banner.dismiss();
      toast.dismiss();
    });
  });

  it('renders the page with no feedback chrome when nothing is queued', async () => {
    const { container } = renderProvider();

    expect(screen.getByRole('heading', { name: 'Releases' })).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'System Notifications' })
    ).toBeNull();
    expect(
      await screen.findByRole('region', { name: /^Notifications/ })
    ).toHaveAttribute('aria-live', 'polite');
    await expectNoA11yViolations(container);
  });

  it('shows an error banner as an alert and removes it on Dismiss', async () => {
    const user = userEvent.setup();
    const { container } = renderProvider();

    act(() => {
      banner.error('Sync failed', {
        description: 'We could not reach your distributor. Try again soon.',
      });
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sync failed');
    expect(alert).toHaveTextContent('We could not reach your distributor.');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a toast with a close button that removes it', async () => {
    const user = userEvent.setup();
    const { container } = renderProvider();
    await screen.findByRole('region', { name: /^Notifications/ });

    act(() => {
      toast.error('Could not save the release');
    });

    expect(
      await screen.findByText('Could not save the release')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const close = await screen.findByRole('button', {
      name: /close toast/i,
    });
    await user.click(close);

    await waitFor(() =>
      expect(screen.queryByText('Could not save the release')).toBeNull()
    );
  });

  it('suppresses all feedback chrome on public profile routes', async () => {
    mockPathname.mockReturnValue('/tim');
    const { container } = renderProvider();

    act(() => {
      banner.info('Offline', { description: 'Changes will sync later.' });
    });

    expect(screen.getByRole('heading', { name: 'Releases' })).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('region', { name: /^Notifications/ })).toBeNull();
    await expectNoA11yViolations(container);
  });
});
