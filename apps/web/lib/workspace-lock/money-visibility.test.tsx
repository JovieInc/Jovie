import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money, MoneyVisibilityProvider } from './money-visibility';

describe('Money visibility', () => {
  it('renders the value when visible', () => {
    render(
      <MoneyVisibilityProvider hidden={false}>
        <Money>$12.34</Money>
      </MoneyVisibilityProvider>
    );
    expect(screen.getByText('$12.34')).toBeTruthy();
  });

  it('redacts the value when hidden', () => {
    render(
      <MoneyVisibilityProvider hidden={true}>
        <Money>$12.34</Money>
      </MoneyVisibilityProvider>
    );
    expect(screen.queryByText('$12.34')).toBeNull();
    expect(screen.getByText('•••')).toBeTruthy();
  });

  it('defaults to visible without a provider', () => {
    render(<Money>$1.00</Money>);
    expect(screen.getByText('$1.00')).toBeTruthy();
  });
});
