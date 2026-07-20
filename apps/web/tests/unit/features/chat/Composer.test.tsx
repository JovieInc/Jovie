import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComposerFocusProvider,
  useComposerFocus,
  useRegisterComposerFocus,
} from '@/components/features/chat/Composer';

const mockPathname = vi.fn(() => '/app/chat');

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

function FocusReader() {
  const { isComposerFocused } = useComposerFocus();
  return (
    <div data-testid='focus-state'>
      {isComposerFocused ? 'focused' : 'idle'}
    </div>
  );
}

function FocusRegistrar() {
  const { setComposerFocused } = useRegisterComposerFocus();
  return (
    <button type='button' onClick={() => setComposerFocused(true)}>
      Focus Composer
    </button>
  );
}

/** Mirrors ChatInput's unmount cleanup for JOV-4043. */
function FocusRegistrarWithUnmountCleanup() {
  const { setComposerFocused } = useRegisterComposerFocus();
  useEffect(() => {
    return () => {
      setComposerFocused(false);
    };
  }, [setComposerFocused]);
  return (
    <button type='button' onClick={() => setComposerFocused(true)}>
      Focus Composer
    </button>
  );
}

describe('Composer focus context', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/app/chat');
  });

  it('defaults to idle outside the provider', () => {
    render(<FocusReader />);
    expect(screen.getByTestId('focus-state')).toHaveTextContent('idle');
  });

  it('tracks composer focus inside the provider', async () => {
    const user = userEvent.setup();

    render(
      <ComposerFocusProvider>
        <FocusReader />
        <FocusRegistrar />
      </ComposerFocusProvider>
    );

    expect(screen.getByTestId('focus-state')).toHaveTextContent('idle');
    await user.click(screen.getByRole('button', { name: 'Focus Composer' }));
    expect(screen.getByTestId('focus-state')).toHaveTextContent('focused');
  });

  it('no-ops registration hooks outside the provider', async () => {
    const user = userEvent.setup();

    render(<FocusRegistrar />);

    await user.click(screen.getByRole('button', { name: 'Focus Composer' }));
    expect(screen.queryByTestId('focus-state')).toBeNull();
  });

  it('resets focus when the route changes (JOV-4043)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ComposerFocusProvider>
        <FocusReader />
        <FocusRegistrar />
      </ComposerFocusProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Focus Composer' }));
    expect(screen.getByTestId('focus-state')).toHaveTextContent('focused');

    mockPathname.mockReturnValue('/app/dashboard');
    await act(async () => {
      rerender(
        <ComposerFocusProvider>
          <FocusReader />
          <FocusRegistrar />
        </ComposerFocusProvider>
      );
    });

    expect(screen.getByTestId('focus-state')).toHaveTextContent('idle');
  });

  it('releases focus when the registering composer unmounts (JOV-4043)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ComposerFocusProvider>
        <FocusReader />
        <FocusRegistrarWithUnmountCleanup />
      </ComposerFocusProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Focus Composer' }));
    expect(screen.getByTestId('focus-state')).toHaveTextContent('focused');

    await act(async () => {
      rerender(
        <ComposerFocusProvider>
          <FocusReader />
        </ComposerFocusProvider>
      );
    });

    expect(screen.getByTestId('focus-state')).toHaveTextContent('idle');
  });
});
