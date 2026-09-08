import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogoIcon } from './LogoIcon';

describe('LogoIcon', () => {
  it('forwards the visual variant and pixel size to BrandLogo', () => {
    render(<LogoIcon size='control' variant='white' />);

    const icon = screen.getByRole('img', { name: 'Jovie' });
    expect(icon).toHaveAttribute('width', '24');
    expect(icon).toHaveAttribute('height', '24');
    expect(icon.parentElement?.className).toContain(`text-${'white'}`);
  });
});
