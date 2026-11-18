import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageTrackedLink } from './HomepageTrackedLink';
import { trackHomepageEvent } from './homepage-analytics';

vi.mock('./homepage-analytics', () => ({ trackHomepageEvent: vi.fn() }));

describe('HomepageTrackedLink certificate', () => {
  beforeEach(() => {
    vi.mocked(trackHomepageEvent).mockClear();
  });

  it('tracks the event with its properties, then runs the caller click handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault()
    );
    const { container } = render(
      <HomepageTrackedLink
        href='/start'
        eventName='homepage_cta_clicked'
        eventProperties={{ placement: 'hero' }}
        onClick={onClick}
      >
        Find your name
      </HomepageTrackedLink>
    );

    const link = screen.getByRole('link', { name: 'Find your name' });
    expect(link).toHaveAttribute('href', '/start');
    await user.click(link);

    expect(trackHomepageEvent).toHaveBeenCalledTimes(1);
    expect(trackHomepageEvent).toHaveBeenCalledWith('homepage_cta_clicked', {
      placement: 'hero',
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toHaveProperty('type', 'click');
    await expectNoA11yViolations(container);
  });

  it('tracks without properties when the caller passes no click handler', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HomepageTrackedLink href='#pricing' eventName='homepage_nav_clicked'>
        See pricing
      </HomepageTrackedLink>
    );

    await user.click(screen.getByRole('link', { name: 'See pricing' }));

    expect(trackHomepageEvent).toHaveBeenCalledWith(
      'homepage_nav_clicked',
      undefined
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left labels as one accessible link', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageTrackedLink href='/start' eventName='homepage_cta_clicked'>
          ابحث عن اسمك وابدأ صفحتك الآن مع كل إصداراتك وروابطك في مكان واحد
        </HomepageTrackedLink>
      </div>
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveTextContent('ابحث عن اسمك');
    await expectNoA11yViolations(container);
  });
});
