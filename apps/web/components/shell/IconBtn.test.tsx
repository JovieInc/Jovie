import { fireEvent, render, screen } from '@testing-library/react';
import { Play } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { IconBtn } from './IconBtn';

function renderBtn(props: Partial<Parameters<typeof IconBtn>[0]> = {}) {
  return render(
    <IconBtn label='Play' {...props}>
      <Play />
    </IconBtn>
  );
}

describe('IconBtn', () => {
  it('renders a button with the label as accessible name', () => {
    renderBtn();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('fires onClick when pressed', () => {
    const onClick = vi.fn();
    renderBtn({ onClick });
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fires onPointerEnter on hover intent', () => {
    const onPointerEnter = vi.fn();
    renderBtn({ onPointerEnter });
    fireEvent.pointerEnter(screen.getByRole('button'));
    expect(onPointerEnter).toHaveBeenCalledOnce();
  });

  it('fires onFocus when focused', () => {
    const onFocus = vi.fn();
    renderBtn({ onFocus });
    fireEvent.focus(screen.getByRole('button'));
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it('forwards testId to the button', () => {
    renderBtn({ testId: 'icon-btn' });
    expect(screen.getByTestId('icon-btn')).toBeInTheDocument();
  });
});
