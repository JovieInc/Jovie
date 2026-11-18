import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Section } from './Section';

describe('Section certificate', () => {
  it('draws the grid with the shared background pattern', async () => {
    const { container } = render(
      <Section withGridBg aria-label='Features'>
        <p>Features body</p>
      </Section>
    );
    const section = screen.getByRole('region', { name: 'Features' });
    const grid = section.querySelector('[aria-hidden="true"]');
    expect(grid?.className).toContain('bg-(image:--background-pattern-grid)');
    await expectNoA11yViolations(container);
  });

  it('renders children only with the default padding and no grid', async () => {
    const { container } = render(
      <Section aria-label='Plain'>
        <p>Plain body</p>
      </Section>
    );
    const section = screen.getByRole('region', { name: 'Plain' });
    expect(section).toHaveClass('py-20');
    expect(section.querySelector('[aria-hidden="true"]')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders right to left without violations', async () => {
    const { container } = render(
      <Section dir='rtl' lang='ar' aria-label='قسم' withBorder>
        <p>خطط لكل إصدار من مساحة عمل واحدة.</p>
      </Section>
    );
    expect(screen.getByRole('region', { name: 'قسم' })).toHaveAttribute(
      'dir',
      'rtl'
    );
    await expectNoA11yViolations(container);
  });
});
