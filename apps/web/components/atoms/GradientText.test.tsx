import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GradientText } from './GradientText';

describe('GradientText', () => {
  it('renders a span with the primary gradient by default', async () => {
    const { container } = render(<GradientText>Jovie</GradientText>);
    const node = screen.getByText('Jovie');
    expect(node.tagName).toBe('SPAN');
    expect(node).toHaveClass('bg-clip-text', 'text-transparent');
    expect(node).toHaveClass('from-accent-blue');
    await expectNoA11yViolations(container);
  });

  it('switches the gradient by variant', () => {
    render(<GradientText variant='success'>Done</GradientText>);
    expect(screen.getByText('Done')).toHaveClass('to-accent-teal');
    expect(screen.getByText('Done')).not.toHaveClass('from-accent-blue');
  });

  it('renders the requested element and merges className', async () => {
    const { container } = render(
      <GradientText as='h2' className='text-3xl'>
        Heading
      </GradientText>
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Heading' });
    expect(heading).toHaveClass('text-3xl');
    await expectNoA11yViolations(container);
  });
});
