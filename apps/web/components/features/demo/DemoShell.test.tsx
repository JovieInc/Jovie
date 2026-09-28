import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoShell } from './DemoShell';

function readWebSource(sourcePath: string): string {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : resolve(process.cwd(), 'apps/web');
  return readFileSync(resolve(webRoot, sourcePath), 'utf8');
}

describe('DemoShell', () => {
  it('uses the banned-icon-safe CircleCheck glyph for the Current catalog tab', () => {
    const { container } = render(
      <DemoShell activeTab='current' onTabChange={vi.fn()}>
        <div>Demo content</div>
      </DemoShell>
    );

    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(container.querySelector('svg.lucide-circle-check')).toBeTruthy();
    expect(container.querySelector('svg.lucide-circle-dot')).toBeNull();
  });

  it('renders the provided children', () => {
    render(
      <DemoShell activeTab='inbox' onTabChange={vi.fn()}>
        <div>Demo content</div>
      </DemoShell>
    );

    expect(screen.getByText('Demo content')).toBeInTheDocument();
  });

  it('imports sidebar chrome from the modular sidebar specifier', () => {
    const source = readWebSource('components/features/demo/DemoShell.tsx');
    expect(source).toContain("@/components/organisms/sidebar'");
    expect(source).not.toContain("@/components/organisms/Sidebar'");
  });
});
