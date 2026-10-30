import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getStageSpec, IMAGERY_STAGES, plateFiles } from '@/lib/imagery/stages';
import { ImageryStage } from './ImageryStage';

describe('ImageryStage', () => {
  it('serves the plate as AVIF with a WebP fallback and hides it from assistive tech', () => {
    const stage = IMAGERY_STAGES[0];
    const { container } = render(<ImageryStage id={stage.id} />);
    const files = plateFiles(stage.plate.id);
    expect(container.querySelector('source')).toHaveAttribute(
      'srcset',
      files.avif
    );
    const plate = container.querySelector('.imagery-stage__plate img');
    expect(plate).toHaveAttribute('src', files.webp);
    expect(plate).toHaveAttribute('alt', '');
  });

  it('names the stage for assistive tech and carries its one accent', () => {
    for (const stage of IMAGERY_STAGES) {
      const { unmount } = render(<ImageryStage id={stage.id} />);
      const group = screen.getByLabelText(stage.alt);
      expect(group).toHaveAttribute('data-accent', stage.plate.accent);
      unmount();
    }
  });

  it('paints layers back to front and recedes the ones behind', () => {
    const stage = IMAGERY_STAGES[0];
    const { container } = render(<ImageryStage id={stage.id} />);
    const layers = [...container.querySelectorAll('[data-layer]')];
    const depths = layers.map(layer =>
      Number(layer.getAttribute('data-depth'))
    );
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(layers.at(-1)).toHaveStyle({ '--layer-recede': '0' });
    expect(
      (layers[0] as HTMLElement).style.getPropertyValue('--layer-recede')
    ).toBe('0.28');
  });

  it('places each layer by the spec, with narrow-screen overrides', () => {
    const stage = getStageSpec('profile-depth');
    const { container } = render(<ImageryStage id='profile-depth' />);
    const front = container.querySelector(
      '[data-layer="profile-hero-desktop"]'
    ) as HTMLElement;
    expect(front.style.getPropertyValue('--layer-x')).toBe('64%');
    expect(front.style.getPropertyValue('--layer-w')).toBe('50%');
    expect(front.style.getPropertyValue('--layer-mobile-w')).toBe('86%');
    const back = container.querySelector(
      '[data-layer="setup-share-profile"]'
    ) as HTMLElement;
    expect(back.style.getPropertyValue('--layer-mobile-display')).toBe('none');
    expect(stage.layers).toHaveLength(2);
  });

  it('renders children inside the quiet zone only', () => {
    const stage = getStageSpec('setup-flow');
    const { container } = render(
      <ImageryStage id='setup-flow'>
        <h2>Headline</h2>
      </ImageryStage>
    );
    const copy = container.querySelector('.imagery-stage__copy') as HTMLElement;
    expect(copy.style.getPropertyValue('--safe-x')).toBe('4%');
    expect(copy.style.getPropertyValue('--safe-w')).toBe('28%');
    expect(stage.safeArea.w).toBe(0.28);
    expect(
      screen.getByRole('heading', { name: 'Headline' })
    ).toBeInTheDocument();
    const bare = render(<ImageryStage id='setup-flow' />);
    expect(bare.container.querySelector('.imagery-stage__copy')).toBeNull();
  });

  it('draws every layer with the real product shot', () => {
    const { container } = render(<ImageryStage id='setup-flow' />);
    expect(container.querySelectorAll('[data-product-shot]')).toHaveLength(2);
  });
});
