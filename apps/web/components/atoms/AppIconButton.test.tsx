import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppIconButton } from './AppIconButton';

const Glyph = () => (
  <svg aria-hidden='true' viewBox='0 0 16 16'>
    <circle cx='8' cy='8' r='6' />
  </svg>
);

describe('AppIconButton', () => {
  it('names the icon-only control and runs its handler on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AppIconButton ariaLabel='Open details' onClick={onClick}>
        <Glyph />
      </AppIconButton>
    );

    await user.click(screen.getByRole('button', { name: 'Open details' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('accepts the native aria-label spelling', () => {
    render(
      <AppIconButton aria-label='Close panel'>
        <Glyph />
      </AppIconButton>
    );

    expect(
      screen.getByRole('button', { name: 'Close panel' })
    ).toBeInTheDocument();
  });

  it('activates from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <AppIconButton ariaLabel='Open details' onClick={onClick}>
        <Glyph />
      </AppIconButton>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Open details' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not run its handler while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AppIconButton ariaLabel='Open details' disabled onClick={onClick}>
        <Glyph />
      </AppIconButton>
    );

    const button = screen.getByRole('button', { name: 'Open details' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows the tooltip label and shortcut when the control is focused', async () => {
    const user = userEvent.setup();
    // The app shell mounts one TooltipProvider at the root; the fixture
    // supplies it because the tooltip cannot render without one.
    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <AppIconButton
          ariaLabel='Toggle sidebar'
          tooltipLabel='Toggle sidebar'
          tooltipShortcut='⌘B'
        >
          <Glyph />
        </AppIconButton>
      </TooltipProvider>
    );

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Toggle sidebar' })
    ).toHaveFocus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Toggle sidebar');
    expect(tooltip).toHaveTextContent('⌘B');
    await expectNoA11yViolations(container);
  });

  it('forwards its ref to the button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <AppIconButton ariaLabel='Open details' ref={ref}>
        <Glyph />
      </AppIconButton>
    );

    expect(ref.current).toBe(
      screen.getByRole('button', { name: 'Open details' })
    );
  });

  it('pads app controls on the same 10px inset as Button (px-2.5)', () => {
    const css = readFileSync(
      resolve(__dirname, '../../styles/design-system.css'),
      'utf8'
    );
    expect(css).toContain('--app-shell-control-padding-x: 10px;');
  });
});
