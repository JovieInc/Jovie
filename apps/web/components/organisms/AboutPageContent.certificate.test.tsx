import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ABOUT_COPY } from '@/data/aboutCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AboutPageContent } from './AboutPageContent';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

describe('AboutPageContent certificate', () => {
  it('renders the about body axe-clean', async () => {
    const { container } = render(<AboutPageContent />);

    expect(
      screen.getByRole('heading', { level: 1, name: ABOUT_COPY.headline })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: ABOUT_COPY.contact.email })
    ).toHaveAttribute('href', `mailto:${ABOUT_COPY.contact.email}`);
    await expectNoA11yViolations(container);
  });

  it('reaches the contact links and the closing claim link by keyboard', async () => {
    const user = userEvent.setup();
    render(<AboutPageContent />);

    const email = screen.getByRole('link', { name: ABOUT_COPY.contact.email });
    const support = screen.getByRole('link', {
      name: ABOUT_COPY.contact.supportLabel,
    });
    await user.tab();
    expect(email).toHaveFocus();
    await user.tab();
    expect(support).toHaveFocus();

    const claim = screen.getByRole('link', { name: 'Claim your profile' });
    expect(claim).toHaveAttribute(
      'data-analytics-event',
      'about_footer_cta_start'
    );
    expect(claim).toHaveAttribute('data-analytics-source', 'about_page_footer');
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AboutPageContent />
      </div>
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
