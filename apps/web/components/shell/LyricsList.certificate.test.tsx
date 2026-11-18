import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LyricsList, type LyricsListLine } from './LyricsList';

const LINES: readonly LyricsListLine[] = [
  { at: 6, text: 'Walking through the static' },
  { at: 74, text: 'I was lost in the light' },
];

describe('LyricsList certificate', () => {
  it('seeks to the pressed line and opens the editor, axe-clean', async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const onEdit = vi.fn();
    const { container } = render(
      <LyricsList lines={LINES} onSeek={onSeek} onEdit={onEdit} />
    );
    await user.click(screen.getByRole('button', { name: /I was lost/ }));
    expect(onSeek).toHaveBeenCalledWith(74);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1:14')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an empty list with only the title', async () => {
    const { container } = render(<LyricsList lines={[]} />);
    expect(screen.getByText('Lyrics')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('disables rows when there is no seek handler', async () => {
    const { container } = render(<LyricsList lines={LINES} />);
    for (const row of screen.getAllByRole('button')) expect(row).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL lyrics axe-clean with custom labels', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const lines = Array.from({ length: 12 }, (_, i) => ({
      at: i * 30,
      text: `أقود في وهج منتصف الليل ${i + 1}`,
    }));
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LyricsList
          lines={lines}
          onSeek={vi.fn()}
          onEdit={onEdit}
          title='كلمات الأغنية'
          editLabel='تعديل'
        />
      </div>
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByText('5:30')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تعديل' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
