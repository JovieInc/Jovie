import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import { ContentSurfaceCard } from './ContentSurfaceCard';

describe('editorial card disclosure', () => {
  it('keeps one truncated summary and reveals detail by keyboard without moving focus', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ContentSurfaceCard
        disclosure={{ label: 'Shipping', summary: 'Loading shipping…' }}
      >
        <Link href='/app/ov/shipping'>Inspect shipping</Link>
      </ContentSurfaceCard>
    );
    const toggle = screen.getByRole('button', {
      name: 'Shipping · Loading shipping…',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Shipping · Loading shipping…')).toHaveClass(
      'truncate'
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    ).toContainElement(screen.getByRole('link'));
    rerender(
      <ContentSurfaceCard
        disclosure={{ label: 'Shipping', summary: '3 items in flight' }}
      >
        <Link href='/app/ov/shipping'>Inspect shipping</Link>
      </ContentSurfaceCard>
    );
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link')).toBeVisible();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
