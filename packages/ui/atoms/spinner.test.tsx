import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import { Spinner } from './spinner';

describe('Spinner', () => {
  it('renders with default props and accessibility', () => {
    render(<Spinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(spinner).toHaveAttribute('data-size', 'md');
    expect(spinner).toHaveAttribute('data-tone', 'primary');
    expect(spinner).toHaveAttribute('data-state', 'loading');
    expect(spinner).toHaveAttribute('aria-live', 'polite');
    expect(spinner.tagName).toBe('SPAN');
  });

  it('applies size classes', () => {
    render(<Spinner size='sm' />);
    expect(screen.getByRole('status')).toHaveClass('h-4', 'w-4');
  });

  it('applies tone and custom className', () => {
    render(<Spinner tone='inverse' className='custom-class' />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('data-tone', 'inverse');
    expect(spinner).toHaveClass('custom-class');
    expect(spinner).toHaveClass('text-btn-primary-foreground');
  });

  it('animates the ring under normal motion', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    const animated = spinner.querySelector('.border-t-transparent');
    expect(animated).toHaveClass('animate-spin');
    expect(animated).toHaveAttribute('data-part', 'indicator');
    expect(spinner.querySelector('[data-part="track"]')).toBeInTheDocument();
  });

  it('renders a static ring under reduced motion', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    const animated = spinner.querySelector('.border-t-transparent');
    expect(animated).toHaveClass('motion-reduce:animate-none');
    expect(animated).toHaveClass('motion-reduce:transform-none');
    expect(animated).toHaveClass('motion-reduce:will-change-auto');
    expect(animated).not.toHaveClass(
      'motion-reduce:animate-[spin_1.2s_linear_infinite]'
    );
  });
});

describe('Spinner layout', () => {
  it('keeps its fixed size beside long text in a flex row', () => {
    render(
      <div className='flex w-56 items-center gap-2'>
        <Spinner size='sm' label='Importing the complete back catalog' />
        <span>Importing the complete back catalog from every distributor…</span>
      </div>
    );

    expect(
      screen.getByRole('status', {
        name: 'Importing the complete back catalog',
      })
    ).toHaveClass('shrink-0', 'h-4', 'w-4');
  });

  it('announces an RTL label', () => {
    render(
      <div dir='rtl'>
        <Spinner label='جارٍ الحفظ' />
      </div>
    );

    expect(screen.getByRole('status', { name: 'جارٍ الحفظ' })).toHaveAttribute(
      'data-state',
      'loading'
    );
  });
});

describe('Spinner accessibility', () => {
  it('has no axe violations across tones, captions and RTL', async () => {
    const { container } = render(
      <div>
        <Spinner />
        <div className='flex items-center gap-2'>
          <Spinner size='sm' tone='muted' label='Saving changes' />
          <span aria-hidden='true'>Saving changes…</span>
        </div>
        <div className='bg-surface-3 p-3'>
          <Spinner size='lg' tone='inverse' label='Uploading artwork' />
        </div>
        <div dir='rtl' lang='ar'>
          <Spinner size='sm' label='جارٍ الحفظ' />
        </div>
      </div>
    );

    await expectNoA11yViolations(container);
  });
});
