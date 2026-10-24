import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/atoms/Calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date | undefined) => void }) => (
    <button
      type='button'
      data-testid='calendar-select-date'
      onClick={() => onSelect?.(new Date('2030-05-20T12:00:00.000Z'))}
    >
      Select May 20 2030
    </button>
  ),
}));

import { formatDatePickerValue } from '@/components/molecules/DatePicker';
import { RELEASE_SCHEDULING_COPY } from '@/data/releaseSchedulingCopy';
import { ReleaseSchedulingLanding } from './ReleaseSchedulingLanding';

describe('ReleaseSchedulingLanding', () => {
  it('renders the live release date fields in the hero', async () => {
    const user = userEvent.setup();
    render(<ReleaseSchedulingLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/release-scheduling/ReleaseSchedulingLanding.tsx'
    );
    expect(hero.closest('[data-accent="ion"]')).not.toBeNull();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(RELEASE_SCHEDULING_COPY.headline);
    expect(heading).toHaveAttribute('data-wrap', 'editorial-title');
    expect(heading).toHaveClass('text-balance');
    expect(heading.className).not.toMatch(/line-clamp/);
    expect(screen.getByText(RELEASE_SCHEDULING_COPY.support)).toBeVisible();

    const fields = screen.getByTestId('release-schedule-fields');
    expect(fields).toBeVisible();
    const panel = screen.getByTestId('release-scheduling-panel');
    expect(panel).toHaveClass('marketing-rounded-frame', 'border');
    expect(panel).toContainElement(fields);

    const releaseDate = formatDatePickerValue(
      RELEASE_SCHEDULING_COPY.fixture.releaseDate
    );
    const releaseTrigger = screen.getByRole('button', {
      name: RELEASE_SCHEDULING_COPY.fields.releaseDate,
    });
    expect(releaseTrigger).toHaveTextContent(releaseDate);
    await user.click(releaseTrigger);
    await user.click(screen.getByTestId('calendar-select-date'));
    expect(releaseTrigger).toHaveTextContent('May 20, 2030');

    for (const link of RELEASE_SCHEDULING_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
  });
});
