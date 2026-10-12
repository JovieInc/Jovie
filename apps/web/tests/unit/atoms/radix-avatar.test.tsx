import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('@radix-ui/react-avatar', () => {
  it('renders the fallback when no image is provided', () => {
    render(
      <AvatarPrimitive.Root data-testid='radix-avatar'>
        <AvatarPrimitive.Fallback>JD</AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
    );

    expect(screen.getByTestId('radix-avatar')).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
