import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { Separator } from './separator';

function hasVisiblePaintAlpha(color: string): boolean {
  const normalized = color.trim().toLowerCase();
  if (normalized === 'transparent') return false;

  const rgbaAlpha = normalized.match(
    /^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/
  );
  if (rgbaAlpha) return Number(rgbaAlpha[1]) > 0;

  const modernAlpha = normalized.match(/\/\s*([0-9.]+)\s*(%)?\s*\)$/);
  if (modernAlpha) {
    const value = Number(modernAlpha[1]);
    return (modernAlpha[2] ? value / 100 : value) > 0;
  }

  return !/\/\s*none\s*\)$/.test(normalized);
}

const meta: Meta<typeof Separator> = {
  title: 'UI/Atoms/Separator',
  component: Separator,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className='w-48 space-y-2'>
      <div>Above</div>
      <Separator />
      <div>Below</div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className='flex h-12 items-center gap-2'>
      <span>Left</span>
      <Separator orientation='vertical' />
      <span>Right</span>
    </div>
  ),
};

export const SemanticSections: Story = {
  render: () => (
    <div className='w-64 space-y-3 text-sm text-secondary-token'>
      <p>Audience overview</p>
      <Separator decorative={false} />
      <p>Traffic sources</p>
    </div>
  ),
};

export const ConformanceMatrix: Story = {
  render: () => (
    <div
      className='grid gap-4'
      data-testid='separator-conformance'
      style={{ width: 'min(20rem, calc(100vw - 2rem))' }}
    >
      <section className='rounded-xl bg-surface-0 p-4 text-primary-token'>
        <p className='mb-3 text-sm font-medium'>Horizontal sections</p>
        <div className='grid gap-3' data-testid='separator-horizontal-region'>
          <p className='text-sm'>Audience overview</p>
          <Separator data-testid='separator-horizontal-decorative' />
          <p className='text-sm'>Traffic sources</p>
          <Separator
            data-testid='separator-horizontal-semantic'
            decorative={false}
          />
          <p className='text-sm'>Release activity</p>
        </div>
      </section>

      <section className='rounded-xl bg-surface-0 p-4 text-primary-token'>
        <p className='mb-3 text-sm font-medium'>Vertical groups</p>
        <div
          className='flex h-12 items-center gap-3'
          data-testid='separator-vertical-region'
        >
          <span className='text-sm'>Left</span>
          <Separator
            data-testid='separator-vertical-decorative'
            orientation='vertical'
          />
          <Separator
            data-testid='separator-vertical-semantic'
            decorative={false}
            orientation='vertical'
          />
          <span className='text-sm'>Right</span>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>(
      '[data-testid="separator-conformance"]'
    );
    await waitFor(() => expect(root).toBeInTheDocument());
    if (!root) return;

    const horizontalDecorative = root.querySelector<HTMLElement>(
      '[data-testid="separator-horizontal-decorative"]'
    );
    const horizontalSemantic = root.querySelector<HTMLElement>(
      '[data-testid="separator-horizontal-semantic"]'
    );
    const verticalDecorative = root.querySelector<HTMLElement>(
      '[data-testid="separator-vertical-decorative"]'
    );
    const verticalSemantic = root.querySelector<HTMLElement>(
      '[data-testid="separator-vertical-semantic"]'
    );

    const tokenProbe = document.createElement('span');
    tokenProbe.setAttribute('aria-hidden', 'true');
    tokenProbe.style.backgroundColor = 'var(--color-border-subtle)';
    tokenProbe.style.height = '1px';
    tokenProbe.style.position = 'fixed';
    tokenProbe.style.visibility = 'hidden';
    tokenProbe.style.width = '1px';
    root.append(tokenProbe);
    const tokenPaint = getComputedStyle(tokenProbe).backgroundColor;
    tokenProbe.remove();
    await expect(tokenPaint).not.toBe('');
    await expect(hasVisiblePaintAlpha(tokenPaint)).toBe(true);

    for (const separator of [
      horizontalDecorative,
      horizontalSemantic,
      verticalDecorative,
      verticalSemantic,
    ]) {
      await expect(separator).toBeInTheDocument();
      if (!separator) return;

      const backgroundColor = getComputedStyle(separator).backgroundColor;
      await expect(hasVisiblePaintAlpha(backgroundColor)).toBe(true);
      await expect(backgroundColor).toBe(tokenPaint);
      await expect(separator).toHaveAttribute('data-slot', 'separator');
    }

    await expect(horizontalDecorative).toHaveAttribute('role', 'none');
    await expect(horizontalSemantic).toHaveAttribute('role', 'separator');
    await expect(horizontalSemantic).not.toHaveAttribute('aria-orientation');
    await expect(verticalDecorative).toHaveAttribute('role', 'none');
    await expect(verticalSemantic).toHaveAttribute('role', 'separator');
    await expect(verticalSemantic).toHaveAttribute(
      'aria-orientation',
      'vertical'
    );

    const horizontalBox = horizontalDecorative?.getBoundingClientRect();
    const verticalBox = verticalDecorative?.getBoundingClientRect();
    await expect(horizontalBox?.width ?? 0).toBeGreaterThan(0);
    await expect(horizontalBox?.height ?? 0).toBeGreaterThan(0);
    await expect(horizontalBox?.height ?? 0).toBeLessThanOrEqual(2);
    await expect(verticalBox?.width ?? 0).toBeGreaterThan(0);
    await expect(verticalBox?.width ?? 0).toBeLessThanOrEqual(2);
    await expect(verticalBox?.height ?? 0).toBeGreaterThan(0);

    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Canonical Separator proof: horizontal and vertical orientations, decorative and semantic accessibility modes, tokenized paint, responsive geometry, and no horizontal overflow.',
      },
    },
  },
};
