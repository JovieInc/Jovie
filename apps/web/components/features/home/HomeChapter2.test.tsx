import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeChapter2 } from './HomeChapter2';

vi.mock('./HomeProfileShowcase', () => ({
  HomeProfileShowcase: ({
    cropAnchor,
    presentation,
    stateId,
  }: Readonly<{
    cropAnchor?: string;
    presentation?: string;
    stateId: string;
  }>) => (
    <div
      data-crop-anchor={cropAnchor}
      data-presentation={presentation}
      data-state-id={stateId}
      data-testid='home-profile-showcase'
    />
  ),
}));

describe('HomeChapter2', () => {
  it('renders bounded payment chapter copy and profile showcase receipt', () => {
    render(<HomeChapter2 />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Get paid.' })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByText("That's it.")).toBeInTheDocument();
    expect(
      screen.getByText(
        'Fan tips once. You get paid. They become a reachable listener.'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('home-profile-showcase')).toHaveAttribute(
      'data-state-id',
      'tips-open'
    );
  });
});
