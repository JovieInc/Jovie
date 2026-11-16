import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockArtist } from '@/lib/test-utils/mock-data';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  UnpublishedEntityAlerts,
  UnpublishedEntityAlertsFallback,
} from './UnpublishedEntityAlerts';

vi.mock('@/components/features/alerts/AlertGrowthLanding', () => ({
  AlertGrowthLanding: ({ exitHref }: { readonly exitHref?: string }) => (
    <div data-testid='alert-growth-landing-stub' data-exit-href={exitHref} />
  ),
}));

describe('<UnpublishedEntityAlerts>', () => {
  it('credits the artist with a link back to their profile', () => {
    render(<UnpublishedEntityAlerts artist={mockArtist} />);

    const profileLink = screen.getByRole('link', { name: mockArtist.name! });
    expect(profileLink).toHaveAttribute('href', `/${mockArtist.handle}`);
  });

  it('includes the entity title in the copy when provided', () => {
    render(
      <UnpublishedEntityAlerts
        artist={mockArtist}
        entityTitle='Midnight Drive'
      />
    );

    expect(screen.getByText(/Midnight Drive/)).toBeDefined();
  });

  it('omits the entity title dash when none is provided', () => {
    render(<UnpublishedEntityAlerts artist={mockArtist} />);

    expect(screen.queryByText(/—/)).toBeNull();
  });

  it('passes the artist profile as the exit target for the alert capture surface', () => {
    render(<UnpublishedEntityAlerts artist={mockArtist} />);

    expect(screen.getByTestId('alert-growth-landing-stub')).toHaveAttribute(
      'data-exit-href',
      `/${mockArtist.handle}`
    );
  });
});

describe('<UnpublishedEntityAlertsFallback>', () => {
  it('renders a non-blank loading shell instead of nothing (JOV-6456)', () => {
    const { container } = render(<UnpublishedEntityAlertsFallback />);

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('UnpublishedEntityAlerts states', () => {
  it('has no axe violations for the default and the loading fallback', async () => {
    const view = render(<UnpublishedEntityAlerts artist={mockArtist} />);
    await expectNoA11yViolations(view.container);
    view.unmount();

    const fallback = render(<UnpublishedEntityAlertsFallback />);
    expect(
      screen.getByRole('status', { name: 'Loading Alerts Sign-up' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(fallback.container);
  });

  it('falls back to the handle and keeps a long title in the copy', async () => {
    const title = 'Never Say A Word (Extended Club Mix) feat. Sunrise Set';
    const { container } = render(
      <UnpublishedEntityAlerts
        artist={{ ...mockArtist, name: '   ' }}
        entityTitle={title}
      />
    );
    expect(
      screen.getByRole('link', { name: mockArtist.handle })
    ).toHaveAttribute('href', `/${mockArtist.handle}`);
    expect(screen.getByText(title)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lowercases the profile link and stays axe-clean right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <UnpublishedEntityAlerts
          artist={{ ...mockArtist, name: 'تيم وايت', handle: ' TimWhite ' }}
          entityTitle='منتصف الليل'
        />
      </div>
    );
    expect(screen.getByRole('link', { name: 'تيم وايت' })).toHaveAttribute(
      'href',
      '/timwhite'
    );
    await expectNoA11yViolations(container);
  });
});
