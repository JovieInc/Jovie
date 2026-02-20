import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: vi.fn(),
}));

describe('CookieBannerSection', () => {
  it('renders banner and buttons', () => {
    render(<CookieBannerSection />);
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept all/i })
    ).toBeInTheDocument();
  });

  it('hides the banner when showBanner is false', () => {
    render(<CookieBannerSection showBanner={false} />);
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });
});
