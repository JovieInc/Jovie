import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_EMAIL } from '@/constants/domains';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SupportPageContent } from './SupportPageContent';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

function stopNavigation(container: HTMLElement) {
  container.addEventListener('click', event => event.preventDefault());
}

describe('SupportPageContent certificate', () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
  });

  it('renders the hero, help paths and email fallback axe-clean', async () => {
    const { container } = render(<SupportPageContent />);

    expect(
      screen.getByRole('heading', { level: 1, name: "We're here to help." })
    ).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${SUPPORT_EMAIL}`
    );
    await expectNoA11yViolations(container);
  });

  it('tracks each help path and the email fallback when clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<SupportPageContent />);
    stopNavigation(container);

    await user.click(
      screen.getByRole('link', { name: 'Browse the Help Center' })
    );
    await user.click(screen.getByRole('link', { name: 'Contact support' }));
    await user.click(screen.getByRole('link', { name: SUPPORT_EMAIL }));

    expect(track).toHaveBeenNthCalledWith(1, 'Support Help Center Clicked', {
      source: 'support_page',
    });
    expect(track).toHaveBeenNthCalledWith(2, 'Support Contact Clicked', {
      source: 'support_page',
    });
    expect(track).toHaveBeenNthCalledWith(3, 'Support Email Clicked', {
      email: SUPPORT_EMAIL,
      source: 'support_page_cta',
    });
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SupportPageContent />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'How Can We Help?' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
