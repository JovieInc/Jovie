import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnLabel } from './ColumnLabel';

type Field = 'title' | 'artist' | 'index';

describe('ColumnLabel', () => {
  it('renders the column label', () => {
    render(
      <ColumnLabel<Field>
        field='title'
        label='Title'
        align='left'
        sortBy='title'
        sortDir='asc'
        onSort={() => undefined}
      />
    );
    const header = screen.getByRole('button', { name: /Title/ });
    expect(header).toBeInTheDocument();
    expect(header.className).toContain('tracking-normal');
    expect(header.className).not.toMatch(/\buppercase\b/);
  });

  it('fires onSort with the field when clicked', () => {
    const onSort = vi.fn();
    render(
      <ColumnLabel<Field>
        field='title'
        label='Title'
        align='left'
        sortBy='index'
        sortDir='asc'
        onSort={onSort}
        defaultField='index'
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSort).toHaveBeenCalledWith('title');
  });

  it('paints the active column cyan when sortBy matches', () => {
    render(
      <ColumnLabel<Field>
        field='title'
        label='Title'
        align='left'
        sortBy='title'
        sortDir='desc'
        onSort={() => undefined}
      />
    );
    expect(screen.getByRole('button').className).toContain('cyan-300');
  });

  it('keeps inactive columns muted', () => {
    render(
      <ColumnLabel<Field>
        field='title'
        label='Title'
        align='left'
        sortBy='artist'
        sortDir='asc'
        onSort={() => undefined}
      />
    );
    expect(screen.getByRole('button').className).not.toContain('cyan-300');
  });

  it('keeps the indicator muted when sortBy equals defaultField', () => {
    render(
      <ColumnLabel<Field>
        field='index'
        label='#'
        align='left'
        sortBy='index'
        sortDir='asc'
        onSort={() => undefined}
        defaultField='index'
      />
    );
    expect(screen.getByRole('button').className).not.toContain('cyan-300');
  });
});
