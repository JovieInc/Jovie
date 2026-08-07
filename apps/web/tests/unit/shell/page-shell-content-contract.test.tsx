import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { PageShell } from '@/components/organisms/PageShell';

/**
 * JOV-4867 — P1 UI drift: one authenticated content contract.
 *
 * `AppShellContentPanel` is the single content contract for authenticated
 * routes. `PageShell` is a compatibility adapter that must render byte-for-byte
 * identical geometry. These tests pin layout, scroll, and focus geometry so
 * the two abstractions cannot drift apart again.
 */
describe('PageShell → AppShellContentPanel content contract (JOV-4867)', () => {
  it('renders identical geometry to AppShellContentPanel when no props are given', () => {
    const adapter = render(
      <PageShell data-testid='adapter-panel'>
        <div>Contract content</div>
      </PageShell>
    );
    const canonical = render(
      <AppShellContentPanel data-testid='adapter-panel'>
        <div>Contract content</div>
      </AppShellContentPanel>
    );

    expect(adapter.container.innerHTML).toEqual(canonical.container.innerHTML);
  });

  it('renders identical geometry for the legacy unframed/unpadded look when props are explicit', () => {
    const adapter = render(
      <PageShell frame='none' contentPadding='none' maxWidth='wide'>
        <div>Legacy content</div>
      </PageShell>
    );
    const canonical = render(
      <AppShellContentPanel frame='none' contentPadding='none' maxWidth='wide'>
        <div>Legacy content</div>
      </AppShellContentPanel>
    );

    expect(adapter.container.innerHTML).toEqual(canonical.container.innerHTML);
  });
});

describe('content contract layout geometry (JOV-4867)', () => {
  it('keeps an unbroken min-h-0/flex-1 chain from the section to the content', () => {
    render(
      <AppShellContentPanel data-testid='geometry-panel'>
        <div>Content</div>
      </AppShellContentPanel>
    );

    const section = screen.getByTestId('geometry-panel');
    expect(section).toHaveClass('flex', 'min-h-0', 'min-w-0', 'flex-1');

    // Every wrapper between the section and the leaf content participates in
    // the height chain — no wrapper may collapse the column or shift layout.
    let node = section.firstElementChild as HTMLElement | null;
    const chain: HTMLElement[] = [];
    while (node && node.firstElementChild) {
      chain.push(node);
      node = node.firstElementChild as HTMLElement | null;
    }
    expect(chain.length).toBeGreaterThanOrEqual(3);
    for (const wrapper of chain) {
      expect(wrapper).toHaveClass('min-h-0');
    }
  });

  it('reserves toolbar space without shifting the content column', () => {
    const { container } = render(
      <AppShellContentPanel toolbar={<div>Toolbar</div>}>
        <div>Content</div>
      </AppShellContentPanel>
    );

    const toolbarSlot = screen.getByText('Toolbar').parentElement;
    expect(toolbarSlot).toHaveClass('shrink-0');
    // Toolbar precedes content in DOM order so tab order matches visual order.
    const html = container.innerHTML;
    expect(html.indexOf('Toolbar')).toBeLessThan(html.indexOf('Content'));
  });
});

describe('content contract scroll geometry (JOV-4867)', () => {
  it('keeps panel scroll constrained by default (routes scroll inside the clip)', () => {
    render(
      <AppShellContentPanel data-testid='scroll-panel'>
        <div>Content</div>
      </AppShellContentPanel>
    );

    const section = screen.getByTestId('scroll-panel');
    expect(section).toHaveClass('min-h-0', 'overflow-hidden');
    expect(section).not.toHaveClass('overflow-y-auto');
  });

  it('lets the page own vertical scroll only in scroll="page" mode (settings routes)', () => {
    render(
      <AppShellContentPanel scroll='page' data-testid='scroll-panel'>
        <div>Content</div>
      </AppShellContentPanel>
    );

    const section = screen.getByTestId('scroll-panel');
    expect(section).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
      'overflow-x-hidden',
      'overscroll-contain'
    );
  });
});

describe('content contract focus geometry (JOV-4867)', () => {
  it('does not steal focus: the shell section is not focusable and adds no tab stop', () => {
    render(
      <AppShellContentPanel toolbar={<button type='button'>Action</button>}>
        <button type='button'>Content action</button>
      </AppShellContentPanel>
    );

    const section = screen.getByText('Content action').closest('section');
    expect(section).not.toBeNull();
    expect(section).not.toHaveAttribute('tabindex');
  });

  it('keeps focus order matching visual order: toolbar controls come first', () => {
    const { container } = render(
      <AppShellContentPanel toolbar={<button type='button'>Action</button>}>
        <button type='button'>Content action</button>
      </AppShellContentPanel>
    );

    const tabStops = container.querySelectorAll('button');
    expect(tabStops[0]).toHaveTextContent('Action');
    expect(tabStops[1]).toHaveTextContent('Content action');
  });
});
