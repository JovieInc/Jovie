import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StandaloneProductPage } from './StandaloneProductPage';

describe('StandaloneProductPage', () => {
  it('renders its content in one main landmark without axe violations', async () => {
    const { container } = render(
      <StandaloneProductPage>
        <h1>Claim your artist profile</h1>
      </StandaloneProductPage>
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Claim your artist profile' })
    );
    await expectNoA11yViolations(container);
  });

  it('caps the content width per size and centres on request', () => {
    const { rerender } = render(
      <StandaloneProductPage>
        <p>Body</p>
      </StandaloneProductPage>
    );
    expect(screen.getByText('Body').parentElement).toHaveClass('max-w-4xl');
    expect(screen.getByRole('main')).not.toHaveClass('justify-center');

    rerender(
      <StandaloneProductPage width='sm' centered>
        <p>Body</p>
      </StandaloneProductPage>
    );
    expect(screen.getByText('Body').parentElement).toHaveClass('max-w-xl');
    expect(screen.getByRole('main')).toHaveClass(
      'flex',
      'items-center',
      'justify-center'
    );
  });
});
