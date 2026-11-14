import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ComposerFocusProvider,
  useComposerFocus,
  useRegisterComposerFocus,
} from './Composer';

const navigation = vi.hoisted(() => ({ pathname: '/start' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

function FocusReadout() {
  const { isComposerFocused } = useComposerFocus();
  return (
    <p data-testid='composer-focus'>{isComposerFocused ? 'focused' : 'idle'}</p>
  );
}

function ComposerField() {
  const { setComposerFocused } = useRegisterComposerFocus();
  return (
    <label>
      Message Jovie
      <textarea
        onFocus={() => setComposerFocused(true)}
        onBlur={() => setComposerFocused(false)}
      />
    </label>
  );
}

function Shell() {
  return (
    <ComposerFocusProvider>
      <FocusReadout />
      <ComposerField />
      <button type='button'>Attach</button>
    </ComposerFocusProvider>
  );
}

describe('ComposerFocusProvider', () => {
  beforeEach(() => {
    navigation.pathname = '/start';
  });

  it('tracks composer focus and blur for the shell chrome', async () => {
    const user = userEvent.setup();
    const { container } = render(<Shell />);

    expect(screen.getByTestId('composer-focus')).toHaveTextContent('idle');
    await user.click(screen.getByRole('textbox', { name: 'Message Jovie' }));
    expect(screen.getByTestId('composer-focus')).toHaveTextContent('focused');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Attach' })).toHaveFocus();
    expect(screen.getByTestId('composer-focus')).toHaveTextContent('idle');
    await expectNoA11yViolations(container);
  });

  it('keeps a typed draft and focus across parent rerenders and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Shell />);
    const field = screen.getByRole('textbox', { name: 'Message Jovie' });

    await user.type(field, 'Make my bio sound less corporate');
    rerender(<Shell />);
    await user.keyboard('{Escape}');

    const after = screen.getByRole('textbox', { name: 'Message Jovie' });
    expect(after).toBe(field);
    expect(after).toHaveValue('Make my bio sound less corporate');
    expect(after).toHaveFocus();
    expect(screen.getByTestId('composer-focus')).toHaveTextContent('focused');
  });

  it('leaves focus mode on a route change without dropping the draft', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Shell />);
    const field = screen.getByRole('textbox', { name: 'Message Jovie' });

    await user.type(field, 'Draft that survives navigation');
    expect(screen.getByTestId('composer-focus')).toHaveTextContent('focused');

    navigation.pathname = '/app/chat';
    rerender(<Shell />);

    expect(screen.getByTestId('composer-focus')).toHaveTextContent('idle');
    expect(field).toHaveValue('Draft that survives navigation');

    await user.click(screen.getByRole('button', { name: 'Attach' }));
    await user.click(field);
    expect(screen.getByTestId('composer-focus')).toHaveTextContent('focused');
  });

  it('reports idle and ignores focus events outside the provider', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <FocusReadout />
        <ComposerField />
      </>
    );

    await user.click(screen.getByRole('textbox', { name: 'Message Jovie' }));
    expect(screen.getByTestId('composer-focus')).toHaveTextContent('idle');
    await expectNoA11yViolations(container);
  });

  it('renders long and right-to-left children unchanged', async () => {
    const long = 'Long composer helper copy that keeps going '.repeat(12);
    const { container } = render(
      <ComposerFocusProvider>
        <p>{long}</p>
        <div dir='rtl' lang='ar'>
          <p>اكتب رسالتك إلى جوفي</p>
        </div>
      </ComposerFocusProvider>
    );

    expect(screen.getByText(long.trim())).toBeInTheDocument();
    expect(screen.getByText('اكتب رسالتك إلى جوفي')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
