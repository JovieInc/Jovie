import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';

describe('HeaderNav flyout interactions', () => {
  it('opens product menu when triggered', () => {
    render(<HeaderNav />);

    const trigger = screen.getAllByRole('button', { name: 'Product' })[0];
    fireEvent.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
