import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LoopBtn } from './LoopBtn';

describe('LoopBtn', () => {
  it('keeps the mode in the accessible name and the count badge decorative', () => {
    render(<LoopBtn mode='track' onClick={() => vi.fn()} className='' />);
    const btn = screen.getByRole('button', { name: /Loop: track 1x/ });
    expect(btn).toBeInTheDocument();
    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names the section mode for its repeat glyph', () => {
    render(<LoopBtn mode='section' onClick={() => vi.fn()} className='' />);
    expect(
      screen.getByRole('button', { name: /Loop: section section-repeat/ })
    ).toBeInTheDocument();
  });
});
