import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RedesignedHero } from './RedesignedHero';

vi.mock('./claim-handle', () => ({
  ClaimHandleForm: ({ size }: { readonly size?: string }) => (
    <form aria-label={`claim handle ${size ?? 'default'}`} />
  ),
}));

describe('RedesignedHero', () => {
  it('renders bounded launch copy and the hero claim form', async () => {
    render(await RedesignedHero());

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'One Link To Launch Your Music Career.',
      })
    ).toHaveClass('marketing-h1-linear', 'line-clamp-2');
    expect(
      screen.getByText(
        'Import your catalog. Fans get notified when you release.'
      )
    ).toHaveClass('marketing-lead-linear', 'text-tertiary-token');
    expect(
      screen.getByRole('form', { name: 'claim handle hero' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Private launch access. No credit card required.')
    ).toBeInTheDocument();
  });
});
