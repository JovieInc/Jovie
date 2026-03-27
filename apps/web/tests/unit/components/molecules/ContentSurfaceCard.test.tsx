import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

describe('ContentSurfaceCard', () => {
  it('uses the shared app card surface chrome', () => {
    render(
      <ContentSurfaceCard data-testid='content-card'>
        Card body
      </ContentSurfaceCard>
    );

    const card = screen.getByTestId('content-card');

    expect(card.className).toContain('bg-(--linear-app-content-surface)');
    expect(card.className).toContain('shadow-[var(--linear-app-card-shadow)]');
    expect(card.className).toContain('border-(--linear-app-frame-seam)');
  });
});
