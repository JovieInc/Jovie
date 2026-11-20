import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepCard } from './StepCard';

describe('StepCard', () => {
  it('renders a bare icon and a screen-reader-only step count', () => {
    const { container } = render(
      <StepCard
        stepNumber='01'
        title='Connect'
        description='Link the profile.'
        icon={<span>icon</span>}
      />
    );

    // Hard ban: no bordered or filled container around the icon.
    expect(container.querySelector('.bg-accent')).toBeNull();
    expect(container.querySelector('.rounded-full')).toBeNull();
    // "Step N" is semantics only, never visible text.
    expect(screen.getByText('Step 01')).toHaveClass('sr-only');
  });
});
