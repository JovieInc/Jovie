import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeekBar } from '@/components/atoms/SeekBar';

describe('SeekBar', () => {
  it('holds local scrub value while pointer is down so engine ticks cannot snap the thumb', () => {
    const onSeek = vi.fn();
    const { rerender } = render(
      <SeekBar currentTime={10} duration={100} onSeek={onSeek} />
    );

    const input = screen.getByLabelText('Seek track') as HTMLInputElement;
    fireEvent.pointerDown(input);
    fireEvent.change(input, { target: { value: '40' } });
    expect(onSeek).toHaveBeenCalledWith(40);
    expect(input.value).toBe('40');

    // Engine reports stale progress mid-scrub — thumb stays on scrub value.
    rerender(<SeekBar currentTime={12} duration={100} onSeek={onSeek} />);
    expect(input.value).toBe('40');

    fireEvent.pointerUp(input);
    rerender(<SeekBar currentTime={40} duration={100} onSeek={onSeek} />);
    expect(input.value).toBe('40');
  });

  it('disables when duration is zero', () => {
    render(<SeekBar currentTime={0} duration={0} onSeek={vi.fn()} />);
    expect(screen.getByLabelText('Seek track')).toBeDisabled();
  });
});
