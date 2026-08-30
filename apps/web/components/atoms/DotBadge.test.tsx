import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('does not force nowrap or clipping on constrained labels', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('whitespace-nowrap');
    expect(source).not.toContain('overflow-hidden');
    expect(source).not.toContain('line-clamp-1');

    render(
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
  });
});
