import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MarketingContentShell } from './MarketingContentShell';

describe('MarketingContentShell', () => {
  it('provides the canonical prose shell around long-form content', () => {
    const { container } = render(
      <MarketingContentShell>
        <h1>About Jovie</h1>
        <p>Keep release context close to the work.</p>
      </MarketingContentShell>
    );

    const shell = container.firstElementChild;
    expect(shell).toHaveClass('py-16', 'sm:py-20', 'lg:py-24');
    expect(shell).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.prose
    );
    expect(
      screen.getByRole('heading', { name: 'About Jovie' })
    ).toBeInTheDocument();

    const body = shell?.firstElementChild?.firstElementChild;
    expect(body).toHaveClass('marketing-body');
    expect(body).toHaveClass('text-(--linear-text-secondary)');
  });

  it('keeps page-specific class hooks on the prose body', () => {
    const { container } = render(
      <MarketingContentShell className='marketing-about-page'>
        <p>Page copy</p>
      </MarketingContentShell>
    );

    const body =
      container.firstElementChild?.firstElementChild?.firstElementChild;
    expect(body).toHaveClass('marketing-body', 'marketing-about-page');
    expect(screen.getByText('Page copy')).toBeInTheDocument();
  });
});
