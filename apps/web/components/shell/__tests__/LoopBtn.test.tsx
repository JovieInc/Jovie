import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoopBtn } from '../LoopBtn';

describe('LoopBtn', () => {
  it('renders an off-state button without the active dot', () => {
    const { container } = render(<LoopBtn mode='off' onClick={() => {}} />);
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('aria-label')).toBe('Loop: off');
    // Active dot only appears when mode !== 'off'.
    expect(container.querySelectorAll('span').length).toBe(0);
  });

  it('renders the "1" badge when mode is track', () => {
    const { getByText } = render(<LoopBtn mode='track' onClick={() => {}} />);
    expect(getByText('1')).toBeInTheDocument();
  });

  it('renders the section badge when mode is section', () => {
    const { getByText } = render(<LoopBtn mode='section' onClick={() => {}} />);
    expect(getByText('⤴')).toBeInTheDocument();
  });

  it('invokes onClick on press', () => {
    const onClick = vi.fn();
    const { container } = render(<LoopBtn mode='off' onClick={onClick} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
