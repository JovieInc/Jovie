import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VIEW_HTML_BLOCK_CSP } from '@/lib/views/html-sandbox';
import type { ViewSpec } from '@/lib/views/spec';
import { SAMPLE_VIEW_SPEC } from './ViewRenderer.stories';

vi.mock('./ViewTable', () => ({
  ViewTable: ({ rows }: { rows: unknown[] }) => (
    <div data-testid='view-table'>{rows.length} rows</div>
  ),
}));
vi.mock('@/components/shell/Sparkline', () => ({
  Sparkline: ({ points }: { points: number[] }) => (
    <div data-testid='sparkline'>{points.length}</div>
  ),
}));

import { ViewRenderer } from './ViewRenderer';

describe('ViewRenderer', () => {
  it('renders each block type and groups stats in one grid', () => {
    const { container } = render(<ViewRenderer spec={SAMPLE_VIEW_SPEC} />);
    expect(container.querySelectorAll('[data-block="stat-grid"]')).toHaveLength(
      1
    );
    expect(screen.getByText('Streams')).toBeInTheDocument();
    expect(screen.getByText('12,408')).toBeInTheDocument();
    expect(screen.getByTestId('sparkline')).toHaveTextContent('8');
    expect(screen.getByTestId('view-table')).toHaveTextContent('3 rows');
    expect(screen.getByText(/Plain text notes/)).toBeInTheDocument();
  });

  it('renders html only in a fully sandboxed iframe', () => {
    const { container } = render(<ViewRenderer spec={SAMPLE_VIEW_SPEC} />);
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('sandbox')).toBe('');
    expect(frame?.getAttribute('srcdoc')).toContain('Sandboxed HTML');
    expect(frame?.getAttribute('srcdoc')).toContain(
      `content="${VIEW_HTML_BLOCK_CSP}"`
    );
    expect(container.querySelector('script')).toBeNull();
  });

  it('never interprets text blocks as html', () => {
    const spec: ViewSpec = {
      schema: 'jovie.view.v1',
      title: 't',
      blocks: [{ type: 'text', body: '<img src=x onerror=alert(1)>' }],
    };
    const { container } = render(<ViewRenderer spec={spec} />);
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByText('<img src=x onerror=alert(1)>')
    ).toBeInTheDocument();
  });
});
