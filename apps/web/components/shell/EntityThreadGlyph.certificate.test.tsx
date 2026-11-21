import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityThreadGlyph } from './EntityThreadGlyph';

describe('EntityThreadGlyph certificate', () => {
  it('opens by mouse and keyboard without reaching the row, axe-clean', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onRow = vi.fn();
    // Events that bubble past the component would reach the document body.
    document.body.addEventListener('click', onRow);
    const { container } = render(
      <>
        <EntityThreadGlyph
          threadTitle='Generating lyric video'
          onOpen={onOpen}
        />
      </>
    );

    await user.click(screen.getByRole('button', { name: /Open Running Chat/ }));
    screen.getByRole('button', { name: /Open Running Chat/ }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(2);
    document.body.removeEventListener('click', onRow);
    expect(onRow).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps a long right-to-left thread title for assistive tech', async () => {
    const title =
      'تحديث نص الإصدار لأغنية منتصف الليل الساكن بعد المراجعة الأخيرة';
    const { container } = render(
      <div dir='rtl'>
        <EntityThreadGlyph
          threadTitle={title}
          onOpen={vi.fn()}
          tooltipLabel='Open'
        />
      </div>
    );

    expect(screen.getByText(title)).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });
});
