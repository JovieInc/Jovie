import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StudioScript } from './StudioScript';

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

const words = ['Tonight', 'I', 'play', 'it', 'live', 'tonight'];

describe('StudioScript', () => {
  it('marks the next word and reads ahead for screen readers', () => {
    render(<StudioScript words={words} nextWordIndex={2} />);

    const script = screen.getByTestId('teleprompter-studio-script');
    const shown = script.querySelectorAll('[data-word]');
    expect(shown).toHaveLength(words.length);
    expect(shown[2]?.className).toContain('underline');
    expect(shown[0]?.className).toContain('text-on-media/35');
    expect(screen.getByText('play it live tonight')).toBeInTheDocument();
  });

  it('passes axe at the start, mid script and empty', async () => {
    for (const [list, index] of [
      [words, 0],
      [words, 3],
      [[], 0],
    ] as const) {
      const { container, unmount } = render(
        <StudioScript words={list} nextWordIndex={index} />
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });
});
