import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableBadge } from './TableBadge';

const sourcePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'TableBadge.tsx'
);

describe('TableBadge', () => {
  it('defaults to small size for table density consistency', () => {
    render(<TableBadge variant='secondary'>Active</TableBadge>);
    expect(screen.getByText('Active').className).toContain('text-3xs');
  });

  it('does not clamp or nowrap labels in constrained table cells', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('line-clamp-1');
    expect(source).not.toContain('whitespace-nowrap');
    expect(source).not.toContain('overflow-hidden');

    render(
      <div className='w-28'>
        <TableBadge variant='error'>
          Destructive Action Requires Review
        </TableBadge>
      </div>
    );

    const badge = screen.getByText('Destructive Action Requires Review');
    expect(badge.className).toContain('whitespace-normal');
    expect(badge.className).toContain('break-words');
    expect(badge.className).not.toContain('line-clamp-1');
  });
});
