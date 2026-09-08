import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepCard } from './StepCard';

describe('StepCard', () => {
  it('uses accent tokens on the icon circle and step label', () => {
    const { container } = render(
      <StepCard
        stepNumber='01'
        title='Connect'
        description='Link the profile.'
        icon={<span>icon</span>}
      />
    );

    expect(container.querySelector('.bg-accent.text-on-accent')).not.toBeNull();
    expect(screen.getByText('Step 01')).toHaveClass('text-accent');
  });
});
