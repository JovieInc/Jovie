import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TruncatedText } from './TruncatedText';

const LONG_TITLE =
  'The Extraordinarily Long Album Title That Keeps Going Well Past Any Reasonable Line Length (Deluxe Anniversary Remastered Edition)';

function renderWithTooltips(ui: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

/** jsdom has no layout; report the span as wider than its box. */
function forceOverflow() {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TruncatedText', () => {
  it('reveals the full text in a tooltip when a long title overflows', async () => {
    forceOverflow();
    const user = userEvent.setup();
    const { container } = renderWithTooltips(
      <TruncatedText className='text-sm'>{LONG_TITLE}</TruncatedText>
    );

    const text = screen.getByText(LONG_TITLE);
    expect(text).toHaveClass('line-clamp-1', 'text-sm');
    await user.hover(text);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_TITLE);
    await expectNoA11yViolations(container);
  });

  it('renders short text without a tooltip trigger', async () => {
    const user = userEvent.setup();
    const { container } = renderWithTooltips(
      <TruncatedText>Short title</TruncatedText>
    );

    await user.hover(screen.getByText('Short title'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('forwards a title and clamps two lines', async () => {
    const { container } = renderWithTooltips(
      <TruncatedText lines={2} title='A, B and 3 more'>
        A, B and 3 more
      </TruncatedText>
    );

    const text = screen.getByText('A, B and 3 more');
    expect(text).toHaveClass('line-clamp-2');
    expect(text).toHaveAttribute('title', 'A, B and 3 more');
    await expectNoA11yViolations(container);
  });

  it('renders an empty string as an empty span', async () => {
    const { container } = renderWithTooltips(
      <TruncatedText>{''}</TruncatedText>
    );
    expect(container.querySelector('span')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('shows the tooltip on hover in a right-to-left document', async () => {
    const user = userEvent.setup();
    const { container } = renderWithTooltips(
      <div dir='rtl' lang='ar'>
        <TruncatedText alwaysShowTooltip tooltipAlign='end'>
          عنوان ألبوم طويل جدا
        </TruncatedText>
      </div>
    );

    await user.hover(screen.getByText('عنوان ألبوم طويل جدا'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'عنوان ألبوم طويل جدا'
    );
    await expectNoA11yViolations(container);
  });
});

describe('TruncatedText scale tokens', () => {
  it('keeps type and size utilities on scale tokens instead of arbitrary values', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(import.meta.dirname, 'TruncatedText.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/min-h-\[2\.5rem\]/);
    expect(source).toContain('min-h-10');
  });
});
