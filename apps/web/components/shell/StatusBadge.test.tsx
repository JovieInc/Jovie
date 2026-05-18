import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('shell StatusBadge', () => {
  it('uses the shared shell metadata chip while preserving status casing', () => {
    const { container } = render(<StatusBadge status='live' />);

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'h-[18px]'
    );
    expect(screen.getByText('Live').className).toContain('uppercase');
  });
});
