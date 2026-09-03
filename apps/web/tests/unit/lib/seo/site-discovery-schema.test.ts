import { describe, expect, it } from 'vitest';
import {
  buildOrganizationSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';

function parseSchema(serialized: string) {
  return JSON.parse(serialized) as Record<string, unknown>;
}

describe('public site discovery schemas', () => {
  it('does not advertise a search action without a public search route', () => {
    const schema = parseSchema(
      buildWebsiteSchema({
        alternateName: ['Jovie', 'jov.ie'],
        description: 'Jovie music platform',
      })
    );

    expect(schema['@type']).toBe('WebSite');
    expect(schema).not.toHaveProperty('potentialAction');
  });

  it('omits social identity links when no confirmed links are supplied', () => {
    const schema = parseSchema(
      buildOrganizationSchema({
        legalName: 'Jovie Technology Inc.',
        description: 'Jovie music platform',
      })
    );

    expect(schema['@type']).toBe('Organization');
    expect(schema).not.toHaveProperty('sameAs');
  });

  it('preserves explicitly supplied confirmed identity links', () => {
    const schema = parseSchema(
      buildOrganizationSchema({
        legalName: 'Jovie Technology Inc.',
        description: 'Jovie music platform',
        sameAs: ['https://example.com/confirmed-jovie-profile'],
      })
    );

    expect(schema.sameAs).toEqual([
      'https://example.com/confirmed-jovie-profile',
    ]);
  });
});
