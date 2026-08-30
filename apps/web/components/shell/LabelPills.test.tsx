import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelPill, LabelPills } from './LabelPills';

describe('LabelPill', () => {
  it('renders children', () => {
    render(<LabelPill>backend</LabelPill>);
    expect(screen.getByText('backend')).toBeInTheDocument();
  });
});

describe('LabelPills', () => {
  it('returns null on empty array', () => {
    const { container } = render(<LabelPills labels={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders only the first label when only one is supplied', () => {
    render(<LabelPills labels={['backend']} />);
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it('renders the first label and a +N chip for the rest', () => {
    render(<LabelPills labels={['backend', 'urgent', 'p1']} />);
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('renders all labels in DOM (collapsed labels exist for hover swap)', () => {
    render(<LabelPills labels={['a', 'b', 'c']} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './LabelPills.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});
