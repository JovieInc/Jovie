import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update, insert: mocks.insert },
}));

import InvestorRespondPage from '@/app/investor-portal/respond/page';

const CLAIM_TOKEN = 'a'.repeat(43);
const LIVE_LINK = {
  id: 'link-1',
  stage: 'shared',
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
};

function pageProps(search: string) {
  return {
    searchParams: Promise.resolve(
      Object.fromEntries(new URLSearchParams(search))
    ),
  };
}

async function renderRespond(search: string): Promise<string> {
  const element = await InvestorRespondPage(pageProps(search));
  return renderToStaticMarkup(element);
}

describe('GET /investor-portal/respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const limit = vi.fn().mockResolvedValue([{ ...LIVE_LINK }]);
    const where = vi.fn(() => ({ limit }));
    mocks.select.mockReturnValue({ from: vi.fn(() => ({ where })) });
  });

  it('renders a confirmation form and never mutates on a scanner-like GET', async () => {
    const html = await renderRespond(`t=${CLAIM_TOKEN}&action=pass`);

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/investors/respond"');
    expect(html).toContain(`value="${CLAIM_TOKEN}"`);
    expect(html).toContain('value="pass"');
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('renders the confirmation for the interested action without mutating', async () => {
    const html = await renderRespond(`t=${CLAIM_TOKEN}&action=interested`);

    expect(html).toContain('value="interested"');
    expect(html).toContain('action="/api/investors/respond"');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('renders the thank-you screen after the confirmed POST redirect, still without mutating', async () => {
    const html = await renderRespond(
      `t=${CLAIM_TOKEN}&action=pass&confirmed=1`
    );

    expect(html).toContain('Thanks for letting us know');
    expect(html).not.toContain('method="post"');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('keeps the interested thank-you copy verbatim after confirmation', async () => {
    const html = await renderRespond(
      `t=${CLAIM_TOKEN}&action=interested&confirmed=1`
    );

    expect(html).toContain('Thanks for your interest!');
    expect(html).toContain('We&#x27;ll be in touch soon to schedule a call.');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('404s malformed tokens, unknown actions, and short tokens before any database access', async () => {
    await expect(renderRespond('t=short&action=pass')).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    await expect(
      renderRespond(`t=${CLAIM_TOKEN}&action=maybe`)
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(renderRespond('action=pass')).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('404s unknown and expired links without mutating', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    mocks.select.mockReturnValue({ from: vi.fn(() => ({ where })) });

    await expect(renderRespond(`t=${CLAIM_TOKEN}&action=pass`)).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );

    const expiredLimit = vi
      .fn()
      .mockResolvedValue([{ id: 'link-1', stage: 'shared', expiresAt: null }]);
    const expiredWhere = vi.fn(() => ({ limit: expiredLimit }));
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({ where: expiredWhere })),
    });

    await expect(renderRespond(`t=${CLAIM_TOKEN}&action=pass`)).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
