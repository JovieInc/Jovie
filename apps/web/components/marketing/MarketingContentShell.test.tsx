import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MarketingContentShell } from './MarketingContentShell';

describe('MarketingContentShell', () => {
  it('renders long-form children inside the prose-width marketing body', () => {
    render(
      <MarketingContentShell>
        <h1>About Jovie</h1>
        <p>One adaptive profile for every drop.</p>
      </MarketingContentShell>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'About Jovie' })
    ).toBeInTheDocument();
    const body = screen.getByText('One adaptive profile for every drop.');
    expect(body.parentElement).toHaveClass(
      'marketing-body',
      'text-(--linear-text-secondary)'
    );
  });

  it('owns the prose pen contract on the padded shell, not a container alias', () => {
    const { container } = render(
      <MarketingContentShell>reading surface</MarketingContentShell>
    );

    const shell = container.firstElementChild;
    expect(shell).toHaveClass('py-16', 'sm:py-20', 'lg:py-24');
    expect(shell).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.prose
    );
    expect(shell?.querySelector('[data-pen-contract]')?.className).toContain(
      'max-w-prose-canonical'
    );
  });

  it('merges caller class hooks onto the marketing body', () => {
    render(
      <MarketingContentShell className='legal-reading'>
        privacy policy
      </MarketingContentShell>
    );

    expect(screen.getByText('privacy policy')).toHaveClass(
      'marketing-body',
      'legal-reading'
    );
  });
});
