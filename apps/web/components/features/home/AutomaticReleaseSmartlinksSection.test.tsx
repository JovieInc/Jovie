import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AutomaticReleaseSmartlinksSection } from './AutomaticReleaseSmartlinksSection';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('@/components/marketing/MarketingPhoneImage', () => ({
  MarketingPhoneImage: () => <div data-testid='phone-capture' />,
}));

vi.mock('@/features/release/SmartLinkProviderButton', () => ({
  SmartLinkProviderButton: ({ label }: { label: string }) => (
    <button type='button'>{label}</button>
  ),
}));

describe('AutomaticReleaseSmartlinksSection', () => {
  it('renders the automatic release smartlink proof', () => {
    render(<AutomaticReleaseSmartlinksSection />);

    expect(
      screen.getByRole('heading', { name: /New Release\?\s+Already Live\./i })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('Zero manual work')).toBeInTheDocument();
    expect(screen.getByText('The Deep End')).toBeInTheDocument();
    expect(screen.getByTestId('phone-capture')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spotify' })).toBeInTheDocument();
  });
});
