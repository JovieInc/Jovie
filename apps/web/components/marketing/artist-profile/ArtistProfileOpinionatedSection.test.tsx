import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';
import storyMeta, { Section } from './ArtistProfileOpinionatedSection.stories';

describe('ArtistProfileOpinionatedSection', () => {
  it('binds its product split to the real section and occurrence', () => {
    render(
      <ArtistProfileOpinionatedSection
        opinionated={ARTIST_PROFILE_COPY.opinionated}
      />
    );
    const root = screen.getByTestId('marketing-section-feature-split');
    expect(root.tagName).toBe('SECTION');
    expect(root).toHaveAttribute('data-marketing-variant', 'phone-right');
    expect(root).toHaveAttribute('data-marketing-occurrence', 'opinionated');
  });

  it('renders record-owned copy and the selected real capture without borrowed copy', () => {
    const preview = getMarketingExportImage(
      'tim-white-profile-subscribe-mobile'
    );
    render(
      <ArtistProfileOpinionatedSection
        opinionated={{
          headline: 'Build a direct relationship.',
          body: 'Subscribers hear when you have news.',
        }}
        preview={preview}
        sectionOccurrence='capture-1'
      />
    );

    const root = screen.getByTestId('marketing-section-feature-split');
    expect(root).toHaveAttribute('data-marketing-variant', 'phone-right');
    expect(root).toHaveAttribute('data-marketing-occurrence', 'capture-1');
    expect(
      screen.getByRole('heading', { name: 'Build a direct relationship.' })
    ).toBeInTheDocument();
    expect(root).toHaveTextContent('Subscribers hear when you have news.');
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent(preview.publicUrl))
    );
    expect(screen.getByRole('img')).toHaveAttribute('alt', preview.alt);
    expect(root.querySelector('figcaption')).toBeNull();
    expect(root).not.toHaveTextContent(
      ARTIST_PROFILE_COPY.opinionated.principle
    );
  });
  it('keeps the opinionated profile source contract bounded and accessible', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileOpinionatedSection.tsx'
      ),
      'utf8'
    );

    expect(source).toContain("'ap-opinionated__headline'");
    expect(source).toContain("'line-clamp-2'");
    expect(source).toContain(
      "data-testid='artist-profile-opinionated-profile'"
    );
    expect(source).toContain(
      'Jovie artist profile leading with one clear Listen action.'
    );
    expect(source).toContain('alt={imageAlt}');
  });

  it('keeps the adjacent Storybook receipt bound to the production fixture', () => {
    expect(storyMeta.component).toBe(ArtistProfileOpinionatedSection);
    expect(Section.args?.opinionated).toBe(ARTIST_PROFILE_COPY.opinionated);
  });
});
