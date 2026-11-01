import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeatureCard } from './FeatureCard';

describe('FeatureCard', () => {
  it('renders title and description', () => {
    render(
      <FeatureCard
        title='Insights'
        description='See what matters'
        icon={<svg data-testid='icon' />}
      />
    );
    expect(screen.getByRole('heading', { name: 'Insights' })).toBeVisible();
    expect(screen.getByText('See what matters')).toBeVisible();
  });

  it('renders the icon bare and ignores the deprecated accent tint', () => {
    render(
      <FeatureCard
        title='Insights'
        description='See what matters'
        accent='purple'
        icon={<svg data-testid='icon' />}
      />
    );
    const wrapper = screen.getByTestId('icon').parentElement;
    expect(wrapper).toHaveClass('text-primary-token');
    expect(wrapper?.className).not.toMatch(/gradient|bg-|h-12|w-12/);
  });
});
