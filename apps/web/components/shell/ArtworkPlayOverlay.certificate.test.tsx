import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtworkPlayOverlay } from './ArtworkPlayOverlay';

function renderOverlay(props: {
  isPlaying: boolean;
  visible: boolean;
  onPlay?: () => void;
}) {
  return render(
    <div className='relative h-16 w-16'>
      <ArtworkPlayOverlay onPlay={props.onPlay ?? vi.fn()} {...props} />
    </div>
  );
}

describe('ArtworkPlayOverlay certificate', () => {
  it('plays on click and Enter when visible, axe-clean for both icons', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const { container, rerender } = renderOverlay({
      isPlaying: false,
      visible: true,
      onPlay,
    });

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await user.keyboard('{Enter}');
    expect(onPlay).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);

    rerender(
      <div className='relative h-16 w-16'>
        <ArtworkPlayOverlay isPlaying visible onPlay={onPlay} />
      </div>
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveClass(
      'opacity-100'
    );
    await expectNoA11yViolations(container);
  });

  it('is transparent and removed from the tab order while hidden', async () => {
    const user = userEvent.setup();
    const { container } = renderOverlay({ isPlaying: false, visible: false });

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveClass('opacity-0');
    await user.tab();
    expect(button).not.toHaveFocus();
    await expectNoA11yViolations(container);
  });
});
