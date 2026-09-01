import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogoIcon } from '@/components/atoms/LogoIcon';

describe('LogoIcon', () => {
  it('renders the brand mark with an accessible name', () => {
    render(<LogoIcon />);
    expect(screen.getByLabelText('Jovie')).toBeInTheDocument();
  });

  it('uses the default size of 48', () => {
    const { container } = render(<LogoIcon />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '48');
  });

  it('passes a custom size to the brand mark', () => {
    const { container } = render(<LogoIcon size={64} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '64');
  });

  it('uses the color tone by default', () => {
    const { container } = render(<LogoIcon />);
    expect(container.querySelector('span')).toHaveClass('text-accent');
  });

  it('uses the muted tone', () => {
    const { container } = render(<LogoIcon variant='muted' />);
    expect(container.querySelector('span')?.getAttribute('class')).toContain(
      'text-muted-foreground/50'
    );
  });

  it('uses the white tone', () => {
    const { container } = render(<LogoIcon variant='white' />);
    expect(container.querySelector('span')).toHaveClass('text-white');
  });

  it('passes a custom className to the brand mark wrapper', () => {
    const { container } = render(<LogoIcon className='my-icon' />);
    expect(container.querySelector('span')).toHaveClass('my-icon');
  });
});
