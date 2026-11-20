import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LogoIcon } from './LogoIcon';

describe('LogoIcon', () => {
  it.each(['color', 'muted', 'white'] as const)(
    'exposes one named, axe-clean logo for the %s variant',
    async variant => {
      const { container } = render(<LogoIcon variant={variant} />);

      expect(screen.getAllByRole('img')).toHaveLength(1);
      expect(screen.getByRole('img', { name: 'Jovie' })).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('forwards the visual variant and pixel size to BrandLogo', () => {
    render(<LogoIcon size='control' variant='white' />);

    const icon = screen.getByRole('img', { name: 'Jovie' });
    expect(icon).toHaveAttribute('width', '24');
    expect(icon).toHaveAttribute('height', '24');
    expect(icon.parentElement?.className).toContain('text-on-media');
  });
});
