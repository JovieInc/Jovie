import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ABOUT_COPY, ABOUT_FACTS, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

type JsonLd = Record<string, unknown> & { '@type': string; '@id'?: string };

async function renderedJsonLd(): Promise<JsonLd[]> {
  const { default: AboutPage } = await import('./page');
  const { container } = render(<AboutPage />);
  return Array.from(
    container.querySelectorAll('script[type="application/ld+json"]')
  ).map(node => JSON.parse(node.textContent ?? '{}') as JsonLd);
}

function byType(nodes: JsonLd[], type: string): JsonLd {
  const node = nodes.find(entry => entry['@type'] === type);
  if (!node) throw new Error(`missing ${type} JSON-LD`);
  return node;
}

describe('/about structured data', () => {
  it('emits AboutPage, Organization, Person, FAQPage and BreadcrumbList', async () => {
    const nodes = await renderedJsonLd();
    expect(nodes.map(node => node['@type'])).toEqual([
      'AboutPage',
      'Organization',
      'Person',
      'FAQPage',
      'BreadcrumbList',
    ]);
  });

  it('links AboutPage to the Organization and the Organization to the Person by @id', async () => {
    const nodes = await renderedJsonLd();
    const about = byType(nodes, 'AboutPage');
    const org = byType(nodes, 'Organization');
    const person = byType(nodes, 'Person');

    expect(about.about).toEqual({ '@id': org['@id'] });
    expect(about.mainEntity).toEqual({ '@id': org['@id'] });
    expect(org.founder).toEqual({ '@id': person['@id'] });
    expect(person.worksFor).toEqual({ '@id': org['@id'] });
    expect(about.url).toBe('https://jov.ie/about');
  });

  it('keeps the Person minimal: name, role, profile, verified sameAs, no biography', async () => {
    const person = byType(await renderedJsonLd(), 'Person');
    expect(Object.keys(person).sort()).toEqual(
      [
        '@context',
        '@id',
        '@type',
        'jobTitle',
        'name',
        'sameAs',
        'url',
        'worksFor',
      ].sort()
    );
    expect(person.name).toBe('Tim White');
    expect(person.jobTitle).toBe('Founder');
    expect(person.url).toBe('https://jov.ie/tim');
    expect(person.sameAs).toEqual([...ABOUT_FACTS.founderSameAs]);
    expect(JSON.stringify(person)).not.toMatch(
      /Armada|Clio|Hulu|NFL|NBA|Netflix|description|award|alumniOf/i
    );
  });

  it('only lists https sameAs links that are on the verified list', async () => {
    const org = byType(await renderedJsonLd(), 'Organization');
    expect(org.sameAs).toEqual([...ABOUT_FACTS.organizationSameAs]);
    for (const url of org.sameAs as string[]) {
      expect(url).toMatch(/^https:\/\//);
    }
    expect(org.sameAs).toContain(
      `https://x.com/${COMPANY_IDENTITY.xHandle.replace(/^@/, '')}`
    );
    expect(COMPANY_IDENTITY.xHandle).toBe('@meetjovie');
    expect(JSON.stringify(org.sameAs)).not.toContain('linkedin');
  });

  it('puts the support email and location in the Organization', async () => {
    const org = byType(await renderedJsonLd(), 'Organization');
    expect(org.legalName).toBe(ABOUT_FACTS.operator);
    expect(org.contactPoint).toMatchObject({
      '@type': 'ContactPoint',
      email: ABOUT_FACTS.supportEmail,
    });
    expect(org.address).toMatchObject({
      addressLocality: 'Los Angeles',
      addressRegion: 'CA',
    });
  });

  it('mirrors the visible Q&A in FAQPage and the visible copy in metadata', async () => {
    const nodes = await renderedJsonLd();
    const faq = byType(nodes, 'FAQPage');
    const entities = faq.mainEntity as Array<{
      name: string;
      acceptedAnswer: { text: string };
    }>;
    expect(entities.map(entity => entity.name)).toEqual(
      ABOUT_FAQ_ITEMS.map(item => item.question)
    );
    expect(entities.map(entity => entity.acceptedAnswer.text)).toEqual(
      ABOUT_FAQ_ITEMS.map(item => item.answer)
    );

    const { metadata } = await import('./page');
    expect(metadata.description).toBe(ABOUT_COPY.metadataDescription);
    expect(String(metadata.description)).not.toMatch(/childcare/i);
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
    expect(String(metadata.openGraph?.description)).toBe(
      ABOUT_COPY.openGraphDescription
    );
    expect(metadata.openGraph?.title).toBe(ABOUT_COPY.metadataTitle);
  });
});
