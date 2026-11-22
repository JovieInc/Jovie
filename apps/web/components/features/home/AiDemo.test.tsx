import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AiDemo } from './AiDemo';

describe('AiDemo', () => {
  it('keeps the premium demo rounded while its pause control remains usable', () => {
    render(<AiDemo variant='premium' contextChips={['Verified profile']} />);

    expect(screen.getByRole('figure', { name: 'AI Writing Demo' })).toHaveClass(
      'rounded-3xl'
    );
    expect(screen.getByText('Verified profile')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pause demo' }));
    expect(screen.getByRole('button', { name: 'Resume demo' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Resume demo' }));
    expect(screen.getByRole('button', { name: 'Pause demo' })).toBeVisible();
  });

  it('draws context chips without a nested border and uses the plain button', async () => {
    const { container } = render(
      <AiDemo variant='premium' contextChips={['Verified profile']} />
    );

    const chip = screen.getByText('Verified profile');
    expect(chip).toHaveClass('bg-surface-2');
    expect(chip).not.toHaveClass('border');
    expect(screen.getByRole('button', { name: 'Pause demo' })).toHaveAttribute(
      'data-slot',
      'plain-button'
    );
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations in the default variant', async () => {
    const { container } = render(<AiDemo variant='default' />);
    await expectNoA11yViolations(container);
  });
});
