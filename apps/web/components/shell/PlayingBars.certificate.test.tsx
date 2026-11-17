import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PlayingBars } from './PlayingBars';

describe('PlayingBars certificate', () => {
  it('exposes one labelled image of three bars, axe-clean', async () => {
    const { container } = render(
      <div className='relative h-10 w-10'>
        <PlayingBars />
      </div>
    );
    const indicator = screen.getByRole('img', { name: 'Now playing' });
    expect(indicator.querySelectorAll('.bg-primary-token')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('takes a label override and extra classes', async () => {
    const { container } = render(
      <div className='relative h-10 w-10'>
        <PlayingBars label='Preview playing' className='opacity-80' />
      </div>
    );
    expect(screen.getByRole('img', { name: 'Preview playing' })).toHaveClass(
      'opacity-80'
    );
    await expectNoA11yViolations(container);
  });
});
