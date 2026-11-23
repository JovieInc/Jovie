import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetaPill } from './MetaPill';

describe('MetaPill', () => {
  it('renders children', () => {
    render(<MetaPill>3 subtasks</MetaPill>);
    expect(screen.getByText('3 subtasks')).toBeInTheDocument();
  });

  it('is a 20px tag like the metadata chips beside it (JOV-12568)', () => {
    render(<MetaPill>3 subtasks</MetaPill>);
    const pill = screen.getByText('3 subtasks');
    expect(pill).toHaveClass('h-5', 'rounded');
    expect(pill).not.toHaveClass('h-6');
    expect(pill).not.toHaveClass('rounded-md');
  });

  it('applies amber tone classes', () => {
    render(<MetaPill tone='amber'>Soon</MetaPill>);
    expect(screen.getByText('Soon').className).toContain('text-warning-text');
  });

  it('applies cyan tone classes', () => {
    render(<MetaPill tone='cyan'>Auto</MetaPill>);
    expect(screen.getByText('Auto').className).toContain('text-accent-text');
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './MetaPill.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});
