import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TRAFFIC_QUALITY_COPY } from '@/data/trafficQualityCopy';
import { TrafficQualityLanding } from './TrafficQualityLanding';

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

describe('TrafficQualityLanding', () => {
  it('renders the live traffic quality filter in the hero', async () => {
    const user = userEvent.setup();
    render(<TrafficQualityLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/traffic-quality/TrafficQualityLanding.tsx'
    );
    expect(hero).toHaveAttribute('data-accent', 'ion');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      TRAFFIC_QUALITY_COPY.headline
    );
    expect(screen.getByText(TRAFFIC_QUALITY_COPY.support)).toBeVisible();

    const filter = screen.getByTestId('traffic-quality-filter');
    expect(filter).toBeVisible();
    const panel = screen.getByTestId('traffic-quality-panel');
    expect(panel).toHaveClass('rounded-3xl', 'border', 'border-subtle');
    expect(panel).toContainElement(filter);

    expect(screen.getByText(TRAFFIC_QUALITY_COPY.filter.title)).toBeVisible();
    expect(
      screen.getByText(TRAFFIC_QUALITY_COPY.filter.highQuality)
    ).toBeVisible();
    expect(
      screen.queryByText(TRAFFIC_QUALITY_COPY.filter.allTraffic)
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole('switch', {
      name: TRAFFIC_QUALITY_COPY.filter.title,
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    expect(
      screen.getByText(TRAFFIC_QUALITY_COPY.filter.allTraffic)
    ).toBeVisible();
    expect(
      screen.queryByText(TRAFFIC_QUALITY_COPY.filter.highQuality)
    ).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    expect(
      screen.getByText(TRAFFIC_QUALITY_COPY.filter.highQuality)
    ).toBeVisible();
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    for (const link of TRAFFIC_QUALITY_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
  });
});
