import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('IconBtn PlainButton', () => {
  it('is a type=button that fires onClick on userEvent.click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderBtn({ onClick });
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('IconBtn shape (JOV-12568)', () => {
  it.each([false, true])(
    'is a circle at rest and never animates its radius (active %s)',
    active => {
      renderBtn({ active });
      const button = screen.getByRole('button', { name: 'Play' });
      expect(button).toHaveClass('rounded-full');
      expect(button.className).not.toContain('rounded-md');
      expect(button.className).not.toContain('hover:rounded-full');
      expect(button.className).not.toContain('border-radius');
    }
  );
});
