import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BannerViewport } from './BannerViewport';
import { banner } from './banner-store';

afterEach(() => {
  act(() => banner.dismiss());
});

describe('BannerViewport', () => {
  it('renders nothing while the store is empty', () => {
    const { container } = render(<BannerViewport />);

    expect(
      screen.queryByRole('region', { name: 'System Notifications' })
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the active banner and dismisses it through the store', async () => {
    const user = userEvent.setup();
    const { container } = render(<BannerViewport />);

    act(() => {
      banner.warning('Import is taking longer than expected', {
        id: 'viewport-test',
        description: 'You can keep editing while Jovie keeps checking.',
      });
    });

    expect(
      screen.getByRole('region', { name: 'System Notifications' })
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Import is taking longer than expected'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(banner.getActiveBanner()).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the highest-priority banner first', async () => {
    const { container } = render(<BannerViewport />);

    act(() => {
      banner.info('Scheduled maintenance tonight');
      banner.error('Payments are degraded');
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Payments are degraded'
    );
    expect(
      screen.queryByText('Scheduled maintenance tonight')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('leaves banners placed on other surfaces to their owners', () => {
    const { container } = render(<BannerViewport />);

    act(() => {
      banner.show({ title: 'Sidebar notice', placement: 'sidebar' });
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps long and right-to-left copy intact', async () => {
    const longTitle =
      'Scheduled maintenance tonight at 10pm PT across analytics, release smart links, audience exports and payouts';
    const { container } = render(
      <div dir='rtl'>
        <BannerViewport />
      </div>
    );

    act(() => {
      banner.info(longTitle, {
        description: 'قد تكون بعض ميزات لوحة التحكم غير متاحة لفترة وجيزة.',
      });
    });

    expect(screen.getByText(longTitle)).toBeInTheDocument();
    expect(
      screen.getByText('قد تكون بعض ميزات لوحة التحكم غير متاحة لفترة وجيزة.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
