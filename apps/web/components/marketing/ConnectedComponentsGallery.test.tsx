import { DEAD_END_RULES, lintCopy } from '@jovie/copy';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CONNECTED_COMPONENTS_COPY } from '@/data/connectedComponentsCopy';
import { getScreenshotScenario } from '@/lib/screenshots/registry';
import { ConnectedComponentsGallery } from './ConnectedComponentsGallery';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
}));

describe('ConnectedComponentsGallery', () => {
  it('keeps rendered captions and accessible descriptions inside the copy policy', () => {
    const { container } = render(<ConnectedComponentsGallery />);
    const copy = [
      container.textContent ?? '',
      ...Array.from(container.querySelectorAll('[alt], [aria-label]'), node =>
        [node.getAttribute('alt'), node.getAttribute('aria-label')].join(' ')
      ),
    ];
    for (const text of copy) {
      expect(lintCopy(text, { register: 'jovie-marketing' }).blocking).toEqual(
        []
      );
      expect(DEAD_END_RULES.filter(rule => rule.pattern.test(text))).toEqual(
        []
      );
    }
  });

  it('renders one real capture per moment, in release order', () => {
    render(<ConnectedComponentsGallery />);
    const gallery = screen.getByTestId('connected-components-gallery');
    expect(gallery).toHaveAttribute('data-count', '3');
    expect(
      screen.getByRole('heading', { name: CONNECTED_COMPONENTS_COPY.headline })
    ).toBeInTheDocument();
    const titles = [...gallery.querySelectorAll('figcaption span:first-child')];
    expect(titles.map(node => node.textContent)).toEqual(
      CONNECTED_COMPONENTS_COPY.states.map(state => state.title)
    );
  });

  it('preserves the complete headline through the canonical section header', () => {
    render(<ConnectedComponentsGallery />);
    const heading = screen.getByRole('heading', {
      level: 2,
      name: CONNECTED_COMPONENTS_COPY.headline,
    });
    expect(heading).toHaveAttribute('data-wrap', 'editorial-title');
    expect(heading.className).not.toMatch(/line-clamp|truncate/);
  });

  it('only shows scenarios the screenshot registry captures', () => {
    for (const state of CONNECTED_COMPONENTS_COPY.states) {
      expect(getScreenshotScenario(state.scenarioId)).not.toBeNull();
    }
  });

  it('states no price, plan, or trial terms (offer truth owns those)', () => {
    const text = JSON.stringify(CONNECTED_COMPONENTS_COPY);
    expect(text).not.toMatch(/\$\d|trial|per month|\/mo\b|free/i);
  });
});
