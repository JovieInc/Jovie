import * as SelectPrimitive from '@radix-ui/react-select';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('@radix-ui/react-select', () => {
  it('renders the trigger with the selected value', () => {
    render(
      <SelectPrimitive.Root defaultValue='apple'>
        <SelectPrimitive.Trigger data-testid='radix-select'>
          <SelectPrimitive.Value />
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content>
            <SelectPrimitive.Viewport>
              <SelectPrimitive.Item value='apple'>
                <SelectPrimitive.ItemText>Apple</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );

    expect(screen.getByTestId('radix-select')).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });
});
