import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';

vi.mock('@/features/home/ProductScreenshot', () => ({
  ProductScreenshot: ({
    testId,
    title,
  }: {
    testId?: string;
    title?: string;
  }) => <div data-testid={testId ?? 'product-screenshot'}>{title}</div>,
}));

describe('HomePageNarrative', () => {
  it('renders the redesigned homepage narrative in order', () => {
    render(<HomePageNarrative />);

    expect(
      screen.getByRole('heading', {
        name: 'Drop more music. Crush every release.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', {
        name: 'Start Free',
      })
    ).toHaveLength(2);
    expect(
      screen.getByRole('heading', {
        name: 'One release. Twenty-seven destinations.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'The stack kills momentum.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Everything after the drop stays connected.',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Artist Profiles')).toBeInTheDocument();
    expect(screen.getByText('Audience Data')).toBeInTheDocument();
    expect(screen.getByText('Release Planning')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'See Profiles',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Start the next release before this one cools off.',
      })
    ).toBeInTheDocument();
  });
});
