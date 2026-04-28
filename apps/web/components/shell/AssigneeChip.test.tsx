import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssigneeChip } from './AssigneeChip';

describe('AssigneeChip', () => {
  it('renders the BrandLogo when kind is jovie', () => {
    const { container } = render(<AssigneeChip kind='jovie' />);
    // BrandLogo renders an svg under a span
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows the Jovie name when expanded', () => {
    render(<AssigneeChip kind='jovie' expanded />);
    expect(screen.getByText('Jovie')).toBeInTheDocument();
  });

  it('renders the human name when expanded', () => {
    render(<AssigneeChip kind='human' name='Tim' expanded />);
    expect(screen.getByText('Tim')).toBeInTheDocument();
  });

  it('hides the name in compact mode', () => {
    render(<AssigneeChip kind='human' name='Tim' />);
    expect(screen.queryByText('Tim')).toBeNull();
  });

  it('renders a custom avatar slot for humans', () => {
    render(
      <AssigneeChip
        kind='human'
        name='Tim'
        avatar={<span data-testid='avatar' />}
      />
    );
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });
});
