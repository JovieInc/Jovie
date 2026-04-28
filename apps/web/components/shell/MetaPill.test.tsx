import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetaPill } from './MetaPill';

describe('MetaPill', () => {
  it('renders children', () => {
    render(<MetaPill>3 subtasks</MetaPill>);
    expect(screen.getByText('3 subtasks')).toBeInTheDocument();
  });

  it('applies amber tone classes', () => {
    render(<MetaPill tone='amber'>Soon</MetaPill>);
    expect(screen.getByText('Soon').className).toContain('amber-300');
  });

  it('applies cyan tone classes', () => {
    render(<MetaPill tone='cyan'>Auto</MetaPill>);
    expect(screen.getByText('Auto').className).toContain('cyan-300');
  });
});
