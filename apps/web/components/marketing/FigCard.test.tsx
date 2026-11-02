import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FigCard } from './FigCard';

describe('FigCard', () => {
  it('renders title and description', () => {
    render(<FigCard title='Fast' description='Ships quickly' />);
    expect(screen.getByRole('heading', { name: 'Fast' })).toBeVisible();
    expect(screen.getByText('Ships quickly')).toBeVisible();
  });

  it('draws the icon bare, without a bordered tile', () => {
    render(
      <FigCard
        title='Fast'
        description='Ships quickly'
        icon={<svg data-testid='icon' />}
      />
    );
    const wrapper = screen.getByTestId('icon').parentElement;
    expect(wrapper).toHaveClass('text-secondary-token');
    expect(wrapper?.className).not.toMatch(/border|bg-surface|h-9|w-9/);
  });

  it('omits the icon wrapper when no icon is given', () => {
    const { container } = render(
      <FigCard title='Fast' description='Ships quickly' />
    );
    expect(container.querySelector('.mb-5')).toBeNull();
  });
});
