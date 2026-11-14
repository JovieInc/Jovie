import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudioPlayButton } from './AudioPlayControl';

describe('AudioPlayButton', () => {
  it('uses the playback state for its accessible action', async () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <AudioPlayButton isPlaying={false} onClick={onClick} />
    );

    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onClick).toHaveBeenCalledOnce();

    await expectNoA11yViolations(container);

    rerender(<AudioPlayButton isPlaying onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('blocks playback while the source is loading', async () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <AudioPlayButton isPlaying={false} isLoading onClick={onClick} />
    );

    const button = screen.getByRole('button', { name: 'Loading track' });
    // Loading keeps the button focusable; activation is cancelled instead.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);

    rerender(<AudioPlayButton isPlaying isLoading onClick={onClick} />);
    expect(
      screen.getByRole('button', { name: 'Loading track' })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps an explicit label ahead of loading and playback state', () => {
    const { rerender } = render(
      <AudioPlayButton isPlaying isLoading label='Preview' onClick={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    rerender(<AudioPlayButton isPlaying={false} label='' onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', '');
  });

  it('reuses the canonical primary Button for compact player controls', () => {
    render(<AudioPlayButton isPlaying={false} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'icon');
    expect(button).toHaveClass('bg-btn-primary', 'text-btn-primary-foreground');
  });

  it('reuses the canonical Button hit target for the persistent compact control', () => {
    render(
      <AudioPlayButton isPlaying={false} onClick={vi.fn()} size='persistent' />
    );

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveAttribute('data-size', 'icon-sm');
    expect(button).toHaveClass('before:h-11');
  });

  it('keeps a long label as the accessible name', async () => {
    const label =
      'Play the preview of Midnight Drive (Extended Club Mix) by The Long Weekend Collective';
    const onClick = vi.fn();
    const { container } = render(
      <AudioPlayButton isPlaying={false} label={label} onClick={onClick} />
    );

    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('works in a right-to-left layout', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AudioPlayButton
          isPlaying
          label='إيقاف المعاينة مؤقتًا'
          onClick={onClick}
        />
      </div>
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'إيقاف المعاينة مؤقتًا' })
    );
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
