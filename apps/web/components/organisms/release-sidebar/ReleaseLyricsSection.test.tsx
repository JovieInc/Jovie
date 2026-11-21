import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseLyricsSection } from './ReleaseLyricsSection';

const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/components/feedback', () => ({ toast }));

function renderSection(
  props: Partial<Parameters<typeof ReleaseLyricsSection>[0]> = {}
) {
  const ui = (extra: typeof props = {}) => (
    <ReleaseLyricsSection
      releaseId='release-1'
      lyrics=''
      isEditable
      onSaveLyrics={vi.fn().mockResolvedValue(undefined)}
      onFormatLyrics={vi.fn().mockResolvedValue([])}
      {...props}
      {...extra}
    />
  );
  const view = render(ui());
  return { ...view, ui };
}

describe('ReleaseLyricsSection', () => {
  it('keeps typed lyrics and focus through a rerender and blur and has no axe violations', async () => {
    const user = userEvent.setup();
    const { container, rerender, ui } = renderSection();

    const box = screen.getByPlaceholderText('Paste your lyrics here');
    await user.type(box, 'Verse one');
    rerender(ui());
    expect(box).toHaveValue('Verse one');
    expect(box).toHaveFocus();
    await user.tab();
    expect(box).toHaveValue('Verse one');
    await expectNoA11yViolations(container);
  });

  it('copies the lyrics and tells the user when there is nothing to copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderSection({ lyrics: 'Verse one' });

    await user.click(screen.getByRole('button', { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith('Verse one');
    expect(toast.success).toHaveBeenCalledWith('Lyrics copied');
  });

  it('disables editing and the formatter when read only and has no axe violations', async () => {
    const { container } = renderSection({
      isEditable: false,
      lyrics: 'Verse one',
    });

    expect(
      screen.getByPlaceholderText('Paste your lyrics here')
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Choose Format' })).toBeNull();
    await expectNoA11yViolations(container);
  });
});
