import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ThreadVideoCard } from './ThreadVideoCard';

describe('ThreadVideoCard certificate', () => {
  it('plays inline and opens full-screen, axe-clean', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onFullscreen = vi.fn();
    const { container } = render(
      <ThreadVideoCard
        title='Midnight Drive'
        durationSec={187}
        onPlay={onPlay}
        onFullscreen={onFullscreen}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Play Midnight Drive — 3:07' })
    );
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onFullscreen).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders a non-interactive card with no handlers, axe-clean', async () => {
    const { container } = render(
      <ThreadVideoCard title='Midnight Drive' durationSec={187} />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL titles axe-clean', async () => {
    const title =
      'Midnight Drive (Extended Club Mix featuring every guest vocalist) [Official Visualizer]';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ThreadVideoCard title={title} durationSec={3725} onPlay={vi.fn()} />
        <ThreadVideoCard title='فيديو كلمات' durationSec={42} />
      </div>
    );
    expect(
      screen.getByRole('button', { name: `Play ${title} — 62:05` })
    ).toBeInTheDocument();
    expect(screen.getByText('فيديو كلمات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
