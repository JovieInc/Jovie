import { describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
  LEGAL_ENTITY_NAME: 'Jovie Technology Inc.',
}));

const { GET } = await import('./route');

describe('GET /llms-full.txt', () => {
  it('returns source-backed plain text with current auth and access semantics', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(body).toContain('**Authentication**: Self-hosted Better Auth');
    expect(body).not.toContain('**Authentication**: Clerk');
    expect(body).toContain(
      'Opt-in audience notifications require enrolled access'
    );
    expect(body).toContain(
      'Advanced analytics and audience CRM capabilities require enrolled access'
    );
    expect(body).toContain('**Free ($0)**');
    expect(body).toContain('https://jov.ie/api/v1/openapi.json');
    expect(body).toContain('## When to use Jovie');
  });
});
