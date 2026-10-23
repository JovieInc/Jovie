import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AiDemo } from './AiDemo';

describe('AiDemo', () => {
  it('keeps the premium demo rounded while its pause control remains usable', () => {
    render(<AiDemo variant='premium' contextChips={['Verified profile']} />);

    expect(screen.getByRole('figure', { name: 'AI writing demo' })).toHaveClass(
      'rounded-3xl'
    );
    expect(screen.getByText('Verified profile')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pause demo' }));
    expect(screen.getByRole('button', { name: 'Resume demo' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Resume demo' }));
    expect(screen.getByRole('button', { name: 'Pause demo' })).toBeVisible();
  });
});
