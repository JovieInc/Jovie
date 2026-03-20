import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: vi.fn(),
}));

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('CookieBannerSection', () => {
  afterEach(() => {
    setCookie('');
  });

  it('renders banner and buttons when jv_cc_required cookie is 1', () => {
    setCookie('jv_cc_required=1');
    render(<CookieBannerSection />);
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept all/i })
    ).toBeInTheDocument();
  });

  it('shows the banner when jv_cc_required cookie is absent (safe default)', () => {
    setCookie('');
    render(<CookieBannerSection />);
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
  });

  it('hides the banner when jv_cc_required cookie is 0', () => {
    setCookie('jv_cc_required=0');
    render(<CookieBannerSection />);
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });
});
