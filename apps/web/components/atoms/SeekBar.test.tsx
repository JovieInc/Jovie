import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SeekBar } from './SeekBar';

const slider = () => screen.getByRole('slider', { name: 'Seek track' });

describe('SeekBar', () => {
  it('shows the current position against the track duration', () => {
    render(<SeekBar currentTime={45} duration={180} onSeek={vi.fn()} />);

    const input = slider() as HTMLInputElement;
    expect(input).toHaveValue('45');
    expect(input.max).toBe('180');
    expect(input.style.getPropertyValue('--seek-pct')).toBe('25%');
  });

  it('seeks to the chosen time', () => {
    const onSeek = vi.fn();
    render(<SeekBar currentTime={45} duration={180} onSeek={onSeek} />);

    fireEvent.change(slider(), { target: { value: '90' } });

    expect(onSeek).toHaveBeenCalledWith(90);
  });

  it('keeps the scrubbed position while playback moves on, then follows playback again', () => {
    const onSeek = vi.fn();
    const { rerender } = render(
      <SeekBar currentTime={10} duration={180} onSeek={onSeek} />
    );

    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '120' } });
    rerender(<SeekBar currentTime={11} duration={180} onSeek={onSeek} />);

    expect(slider()).toHaveValue('120');

    fireEvent.pointerUp(slider());
    rerender(<SeekBar currentTime={121} duration={180} onSeek={onSeek} />);

    expect(slider()).toHaveValue('121');
  });

  it('ends a scrub when the pointer is cancelled or focus leaves', () => {
    const { rerender } = render(
      <SeekBar currentTime={10} duration={180} onSeek={vi.fn()} />
    );

    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '120' } });
    fireEvent.pointerCancel(slider());
    rerender(<SeekBar currentTime={20} duration={180} onSeek={vi.fn()} />);
    expect(slider()).toHaveValue('20');

    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '150' } });
    fireEvent.blur(slider());
    rerender(<SeekBar currentTime={30} duration={180} onSeek={vi.fn()} />);
    expect(slider()).toHaveValue('30');
  });

  it('is disabled and does not seek until the duration is known', () => {
    const onSeek = vi.fn();
    render(<SeekBar currentTime={12} duration={0} onSeek={onSeek} />);

    expect(slider()).toBeDisabled();
    expect(
      (slider() as HTMLInputElement).style.getPropertyValue('--seek-pct')
    ).toBe('0%');

    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '0.5' } });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('is disabled when the disabled prop is set', () => {
    render(
      <SeekBar currentTime={45} duration={180} onSeek={vi.fn()} disabled />
    );

    expect(slider()).toBeDisabled();
  });

  it('has no accessibility violations, enabled or disabled', async () => {
    const { container, rerender } = render(
      <SeekBar currentTime={45} duration={180} onSeek={vi.fn()} />
    );
    await expectNoA11yViolations(container);

    rerender(<SeekBar currentTime={0} duration={0} onSeek={vi.fn()} />);
    await expectNoA11yViolations(container);
  });
});
