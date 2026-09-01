import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureRow } from './FeatureRow';

vi.mock('./ProductScreenshot', () => ({
  ProductScreenshot: ({ alt }: { readonly alt: string }) => <img alt={alt} />,
}));

describe('FeatureRow', () => {
  it('renders bounded copy, bullets, and screenshot receipt', () => {
    render(
      <FeatureRow
        heading='Release day handled.'
        description='Jovie routes fans from one release page.'
        bullets={['Smart link ready', 'Fan list owned']}
        screenshotSrc='/profile.png'
        screenshotAlt='Jovie release page preview'
        screenshotWidth={1440}
        screenshotHeight={900}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Release day handled.' })
    ).toHaveClass('line-clamp-2');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByAltText('Jovie release page preview')
    ).toBeInTheDocument();
  });
});
