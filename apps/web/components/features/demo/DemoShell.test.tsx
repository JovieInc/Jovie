import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('draws the details toggle from the rail icon family in both states', () => {
    const { container } = render(
      <TooltipProvider>
        <DemoShell
          activeTab='inbox'
          onTabChange={vi.fn()}
          rightPanel={<div>Details</div>}
        >
          <div>Demo content</div>
        </DemoShell>
      </TooltipProvider>
    );

    const toggle = screen.getByRole('button', { name: /details panel/i });
    const glyph = () => toggle.querySelector('svg');
    const wasOpen = toggle.getAttribute('aria-label') === 'Hide details panel';
    const first = glyph()?.getAttribute('class') ?? '';
    expect(first).toContain(
      wasOpen ? 'lucide-rail-right-open' : 'lucide-rail-right-closed'
    );

    fireEvent.click(toggle);
    const second = glyph()?.getAttribute('class') ?? '';
    expect(second).toContain(
      wasOpen ? 'lucide-rail-right-closed' : 'lucide-rail-right-open'
    );
    expect(container.querySelector('svg[class*="lucide-panel-"]')).toBeNull();
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
    expect(source).not.toContain(`@/components/organisms/${'Sidebar'}'`);
  });
});
