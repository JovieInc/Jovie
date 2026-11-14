import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DotBadge } from './DotBadge';

const sourcePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'DotBadge.tsx'
);

const destructiveVariant = {
  className: 'border-error bg-error-subtle text-error',
  dotClassName: 'bg-error',
} as const;

describe('DotBadge', () => {
  it('does not force nowrap or clipping on constrained labels', async () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('whitespace-nowrap');
    expect(source).not.toContain('overflow-hidden');
    expect(source).not.toContain('line-clamp-1');

    const { container } = render(
      <div className='w-28'>
        <DotBadge
          label='Destructive Action Requires Review'
          variant={destructiveVariant}
        />
      </div>
    );

    const badge = screen.getByText('Destructive Action Requires Review');
    expect(badge.className).toContain('whitespace-normal');
    expect(badge.className).toContain('break-words');
    expect(badge.className).not.toContain('whitespace-nowrap');
    await expectNoA11yViolations(container);
  });

  it('keeps the dot decorative and exposes the label and title', async () => {
    const { container } = render(
      <DotBadge
        label='Active'
        size='sm'
        title='Matched on Spotify'
        variant={{
          className: 'border-success bg-success-subtle text-success',
          dotClassName: 'bg-success',
        }}
      />
    );

    const badge = screen.getByText('Active');
    expect(badge).toHaveAttribute('title', 'Matched on Spotify');
    expect(badge).toHaveClass('min-h-5', 'text-3xs');
    expect(badge.querySelector('[aria-hidden]')).toHaveClass('size-1');
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DotBadge label='نشط' variant={destructiveVariant} />
      </div>
    );

    expect(screen.getByText('نشط')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
