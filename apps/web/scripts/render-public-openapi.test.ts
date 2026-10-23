import { describe, expect, it } from 'vitest';
import { renderPublicOpenApiDocument } from './render-public-openapi';

describe('renderPublicOpenApiDocument', () => {
  it('renders the public contract as stable, newline-terminated JSON', () => {
    const first = renderPublicOpenApiDocument();
    const second = renderPublicOpenApiDocument();

    expect(first).toBe(second);
    expect(first.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(first);
    expect(parsed.info.title.length).toBeGreaterThan(0);
    expect(Object.keys(parsed.paths).length).toBeGreaterThan(0);
  });
});
