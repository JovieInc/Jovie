import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  ComposerFocusProvider,
  useComposerFocus,
  useRegisterComposerFocus,
} from '@/components/features/chat/Composer';

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

describe('Composer focus context', () => {
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
});
