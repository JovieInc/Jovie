import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CopyToggleIcon } from './CopyToggleIcon';

describe('CopyToggleIcon', () => {
  it('renders the copy icon when copied is false', () => {
    const { container } = render(<CopyToggleIcon copied={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class')).toContain('lucide-copy');
  });

  it('renders the check icon when copied is true', () => {
    const { container } = render(<CopyToggleIcon copied={true} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('lucide-circle-check');
  });

  it('applies cyan tint to the check icon for copied state', () => {
    const { container } = render(<CopyToggleIcon copied={true} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('text-cyan-300');
  });

  it('forwards className to the rendered icon', () => {
    const { container } = render(
      <CopyToggleIcon copied={false} className='custom-class' />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('custom-class');
  });

  it('respects a custom size override', () => {
    const { container } = render(
      <CopyToggleIcon copied={false} size='h-5 w-5' />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('h-5');
    expect(svg?.getAttribute('class')).toContain('w-5');
  });

  it('passes strokeWidth through to both icons', () => {
    const { container, rerender } = render(
      <CopyToggleIcon copied={false} strokeWidth={3} />
    );
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe(
      '3'
    );

    rerender(<CopyToggleIcon copied strokeWidth={3} />);
    expect(
      container
        .querySelector('svg.lucide-circle-check')
        ?.getAttribute('stroke-width')
    ).toBe('3');
  });

  // The documented usage: a labelled button that flips `copied` on press.
  function renderCopyButton() {
    let copied = false;
    const ui = () => (
      <button
        type='button'
        onClick={() => {
          copied = !copied;
          view.rerender(ui());
        }}
        aria-label={copied ? 'Copied' : 'Copy'}
      >
        <CopyToggleIcon copied={copied} />
      </button>
    );
    const view = render(ui());
    return view;
  }

  it('swaps to the check when its button is pressed, and back again', async () => {
    const user = userEvent.setup();
    const { container } = renderCopyButton();

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(container.querySelector('svg.lucide-circle-check')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Copied' }));
    expect(container.querySelector('svg.lucide-copy')).not.toBeNull();
  });

  it('has no accessibility violations inside a labelled button, idle or copied', async () => {
    const user = userEvent.setup();
    const { container } = renderCopyButton();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await expectNoA11yViolations(container);
  });
});
