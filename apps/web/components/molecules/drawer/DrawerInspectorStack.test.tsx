import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerInspectorStack } from './DrawerInspectorStack';

describe('DrawerInspectorStack', () => {
  it('keeps inspector children in one named stack', () => {
    render(
      <DrawerInspectorStack data-testid='inspector-stack'>
        <span>Release</span>
        <span>Status</span>
      </DrawerInspectorStack>
    );

    const stack = screen.getByTestId('inspector-stack');
    expect(stack).toHaveTextContent('Release');
    expect(stack).toHaveTextContent('Status');
    expect(stack.className).toContain('space-y-2');
  });
});
