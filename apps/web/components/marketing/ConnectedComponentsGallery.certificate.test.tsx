import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CONNECTED_COMPONENTS_COPY,
  type ConnectedComponentsCopy,
} from '@/data/connectedComponentsCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

describe('ConnectedComponentsGallery certificate', () => {
  it('renders the three captured release moments axe-clean', async () => {
    const { container } = render(<ConnectedComponentsGallery />);

    expect(
      screen.getByRole('heading', { name: CONNECTED_COMPONENTS_COPY.headline })
    ).toBeInTheDocument();
    const gallery = screen.getByRole('region', {
      name: CONNECTED_COMPONENTS_COPY.galleryLabel,
    });
    expect(within(gallery).getAllByRole('listitem')).toHaveLength(3);
    expect(within(gallery).getAllByRole('img')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('draws a caption-only state without a capture', async () => {
    const [first, second, third] = CONNECTED_COMPONENTS_COPY.states;
    const copy = {
      ...CONNECTED_COMPONENTS_COPY,
      states: [
        first,
        second,
        { id: 'x', title: third.title, body: third.body },
      ],
    } as unknown as ConnectedComponentsCopy;
    const { container } = render(<ConnectedComponentsGallery copy={copy} />);

    const gallery = screen.getByTestId('connected-components-gallery');
    expect(within(gallery).getAllByRole('img')).toHaveLength(2);
    expect(within(gallery).getByText(third.title)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
