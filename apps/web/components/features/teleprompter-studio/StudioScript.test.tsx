import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StudioScript } from './StudioScript';

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

const words = ['Tonight', 'I', 'play', 'it', 'live', 'tonight'];

describe('StudioScript', () => {
  it('marks the next word and reads ahead for screen readers', () => {
    render(<StudioScript words={words} nextWordIndex={2} onSeek={vi.fn()} />);

    const script = screen.getByTestId('teleprompter-studio-script');
    const buttons = script.querySelectorAll('button');
    expect(buttons).toHaveLength(words.length);
    expect(buttons[2]?.className).toContain('underline');
    expect(buttons[0]?.className).toContain('text-white/35');
    expect(screen.getByText('play it live tonight')).toBeInTheDocument();
  });

  it('seeks to a tapped word', () => {
    const onSeek = vi.fn();
    render(<StudioScript words={words} nextWordIndex={0} onSeek={onSeek} />);

    fireEvent.click(screen.getByText('live'));
    expect(onSeek).toHaveBeenCalledWith(4);
  });
});
