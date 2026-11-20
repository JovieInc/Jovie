import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LoopBtn } from './LoopBtn';

describe('LoopBtn', () => {
  it('keeps the mode in the accessible name and the count badge decorative', async () => {
    const { container } = render(
      <LoopBtn mode='track' onClick={() => vi.fn()} className='' />
    );
    const btn = screen.getByRole('button', { name: /Loop: track 1/ });
    expect(btn).toBeInTheDocument();
    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('names the section mode for its repeat glyph', async () => {
    const { container } = render(
      <LoopBtn mode='section' onClick={() => vi.fn()} className='' />
    );
    expect(
      screen.getByRole('button', { name: /Loop: section ⤴/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('cycles through its handler from the off state', async () => {
    const onClick = vi.fn();
    const { container } = render(<LoopBtn mode='off' onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Loop: off' }));
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps its name and handler in a right-to-left layout', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LoopBtn mode='track' onClick={onClick} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /Loop: track 1/ }));
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
