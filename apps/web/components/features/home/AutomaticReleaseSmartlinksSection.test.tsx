import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('passes no className override to the shared DSP buttons', () => {
    // JOV-6149: rest styling belongs to the shared secondary variant; this
    // consumer renders SmartLinkProviderButton without a className prop.
    const source = readFileSync(
      resolve(__dirname, './AutomaticReleaseSmartlinksSection.tsx'),
      'utf8'
    );
    expect(source).toMatch(/<SmartLinkProviderButton\b/);
    expect(source).not.toMatch(/<SmartLinkProviderButton\b[^>]*className=/);
  });
});
