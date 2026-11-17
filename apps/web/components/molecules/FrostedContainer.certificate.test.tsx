import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FrostedContainer } from './FrostedContainer';

describe('FrostedContainer certificate', () => {
  it.each([
    ['default', 'bg-surface-1/60'],
    ['glass', 'ring-subtle'],
    ['solid', 'border-default'],
  ] as const)(
    'paints the %s card with semantic tokens',
    async (variant, token) => {
      const { container } = render(
        <FrostedContainer variant={variant} backgroundPattern='none'>
          <p>Welcome back</p>
        </FrostedContainer>
      );
      expect(screen.getByText('Welcome back').parentElement).toHaveClass(token);
      await expectNoA11yViolations(container);
    }
  );

  it('renders long RTL content without violations', async () => {
    const { container } = render(
      <FrostedContainer showGradientBlurs={false}>
        <div dir='rtl' lang='ar'>
          أنشئ ملفك الفني وتواصل مع المعجبين في كل مكان.
        </div>
      </FrostedContainer>
    );
    expect(
      screen.getByText('أنشئ ملفك الفني وتواصل مع المعجبين في كل مكان.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
