import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SolutionsRecordCta,
  SolutionsRecordFaq,
  SolutionsRecordFeatureSplit,
  SolutionsRecordHero,
} from './SolutionsRecordSections';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/solutions/founders',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('next/image', () => ({
  default: (props: { readonly alt?: string; readonly src?: unknown }) => (
    <img
      alt={props.alt ?? ''}
      src={typeof props.src === 'string' ? props.src : ''}
    />
  ),
}));

const media = {
  kind: 'screenshot-registry' as const,
  id: 'tim-white-profile-subscribe-mobile',
  alt: 'A Jovie profile with its subscribe action open.',
};

describe('SolutionsRecordSections', () => {
  it('renders the split claim hero from record copy through the locked binding', () => {
    const { container } = render(
      <SolutionsRecordHero
        heroVariant='split-link-claim'
        copy={{ headline: 'Own your page', subhead: 'One page, yours.' }}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Own your page'
    );
    expect(screen.getByText('One page, yours.')).toBeInTheDocument();
    expect(
      container.querySelector('[data-marketing-variant="split-claim-card"]')
    ).not.toBeNull();
    expect(screen.getByTestId('solutions-record-claim-card')).toBeVisible();
  });

  it('renders a copy-only left hero and a screenshot split hero', () => {
    const { container, rerender } = render(
      <SolutionsRecordHero
        heroVariant='left-content'
        copy={{ headline: 'Read this', subhead: 'Context only.' }}
      />
    );
    expect(
      container.querySelector('[data-marketing-variant="left-none"]')
    ).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();

    rerender(
      <SolutionsRecordHero
        heroVariant='f-layout-desktop-screenshot'
        copy={{ headline: 'See it', subhead: 'The product.' }}
        media={media}
      />
    );
    expect(screen.getByAltText(media.alt)).toBeInTheDocument();
  });

  it('switches the feature split variant on media and renders its slots', () => {
    const { container, rerender } = render(
      <SolutionsRecordFeatureSplit
        instanceId='capture-1'
        copy={{ headline: 'Subscribers', body: 'They opt in.' }}
        media={media}
      />
    );
    expect(
      container.querySelector('[data-marketing-variant="phone-right"]')
    ).not.toBeNull();
    expect(screen.getByAltText(media.alt)).toBeInTheDocument();

    rerender(
      <SolutionsRecordFeatureSplit
        instanceId='capture-1'
        copy={{ headline: 'Subscribers', body: 'They opt in.' }}
      />
    );
    expect(
      container.querySelector('[data-marketing-variant="editorial"]')
    ).not.toBeNull();
    expect(screen.getByText('They opt in.')).toBeInTheDocument();
  });

  it('renders the CTA headline and FAQ entries', () => {
    render(
      <>
        <SolutionsRecordCta
          instanceId='cta-1'
          copy={{ headline: 'Start free.' }}
        />
        <SolutionsRecordFaq
          items={[{ question: 'Is it free?', answer: 'Yes.' }]}
        />
      </>
    );

    expect(
      screen.getByTestId('solutions-record-cta-headline')
    ).toHaveTextContent('Start free.');
    expect(screen.getByText('Is it free?')).toBeInTheDocument();
  });
});
