import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  mcpCall: vi.fn(),
}));

vi.mock('@/lib/wiki/gbrain-client', () => ({
  mcpCall: hoisted.mcpCall,
}));

const {
  GBRAIN_CONTEXT_DEFAULT_SCOPE,
  isValidGbrainContextScope,
  listGbrainContextPages,
  resolveGbrainContextScope,
  searchGbrainContext,
} = await import('@/lib/wiki/gbrain-context');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveGbrainContextScope', () => {
  it('defaults to the operations namespace scope', () => {
    expect(resolveGbrainContextScope({ query: 'shipping latency' })).toEqual({
      query: 'shipping latency',
      scope: 'ops/',
    });
  });

  it('honors an explicit valid scope over the default', () => {
    expect(
      resolveGbrainContextScope({ query: 'cosmic gate', scope: 'releases/' })
    ).toEqual({ query: 'cosmic gate', scope: 'releases/' });
  });

  it('requires deliberate expansion to all', () => {
    expect(
      resolveGbrainContextScope({ query: 'fundraise', scope: 'all' })
    ).toEqual({ query: 'fundraise', scope: 'all' });
    expect(resolveGbrainContextScope({ query: 'fundraise' }).scope).not.toBe(
      'all'
    );
  });

  it('falls back to the default scope for an invalid explicit scope', () => {
    expect(resolveGbrainContextScope({ query: 'x', scope: 'OPS/' }).scope).toBe(
      'ops/'
    );
    expect(resolveGbrainContextScope({ query: 'x', scope: 'ops' }).scope).toBe(
      'ops/'
    );
  });

  it('parses an inline scope prefix and strips it from the query', () => {
    expect(
      resolveGbrainContextScope({ query: 'scope:releases/ cosmic gate' })
    ).toEqual({ query: 'cosmic gate', scope: 'releases/' });
    expect(resolveGbrainContextScope({ query: 'scope:all fundraise' })).toEqual(
      { query: 'fundraise', scope: 'all' }
    );
  });

  it('keeps a malformed inline scope untouched with the default scope', () => {
    const resolved = resolveGbrainContextScope({
      query: 'scope:OPS/ nothing',
    });
    expect(resolved.scope).toBe('ops/');
    expect(resolved.query).toBe('scope:OPS/ nothing');
  });
});

describe('isValidGbrainContextScope', () => {
  it('accepts all and trailing-slash namespace prefixes', () => {
    expect(isValidGbrainContextScope('all')).toBe(true);
    expect(isValidGbrainContextScope('ops/')).toBe(true);
    expect(isValidGbrainContextScope('ops/summer/')).toBe(true);
    expect(isValidGbrainContextScope('releases/2026/')).toBe(true);
  });

  it('rejects bare, uppercase, and traversal scopes', () => {
    expect(isValidGbrainContextScope('ops')).toBe(false);
    expect(isValidGbrainContextScope('OPS/')).toBe(false);
    expect(isValidGbrainContextScope('../ops/')).toBe(false);
    expect(isValidGbrainContextScope('')).toBe(false);
  });
});

describe('searchGbrainContext', () => {
  it('surfaces unavailable with the reason instead of a fake zero', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: false,
      reason: 'GBRAIN_API_KEY not configured',
    });
    const result = await searchGbrainContext({ query: 'anything' });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('GBRAIN_API_KEY not configured');
    }
  });

  it('reports an unreachable gbrain as unavailable, never empty', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: false,
      reason: 'gbrain unreachable: timeout',
    });
    const result = await searchGbrainContext({ query: 'anything' });
    expect(result.status).toBe('unavailable');
  });

  it('requires a query and reports it as unavailable with a reason', async () => {
    const result = await searchGbrainContext({ query: '   ' });
    expect(result.status).toBe('unavailable');
    expect(hoisted.mcpCall).not.toHaveBeenCalled();
  });

  it('returns a measured zero only after a successful scoped search', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: true,
      data: [{ slug: 'releases/cosmic-gate', title: 'Cosmic Gate', score: 1 }],
    });
    const result = await searchGbrainContext({ query: 'gate' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.scope).toBe('ops/');
      expect(result.scopeExpanded).toBe(false);
      expect(result.hits).toEqual([]);
    }
  });

  it('filters hits to the requested scope and maps chunk text', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: true,
      data: [
        {
          slug: 'ops/summer/shipping',
          title: 'Summer shipping',
          score: 0.9,
          chunk_text: 'shipping state',
        },
        {
          slug: 'marketing/hero-copy',
          title: 'Hero copy',
          score: 0.8,
          chunk_text: 'hero',
        },
      ],
    });
    const result = await searchGbrainContext({ query: 'shipping' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.hits).toEqual([
        {
          slug: 'ops/summer/shipping',
          title: 'Summer shipping',
          score: 0.9,
          chunkText: 'shipping state',
        },
      ]);
    }
  });

  it('keeps out-of-scope hits visible only through deliberate expansion', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: true,
      data: [{ slug: 'marketing/hero-copy', title: 'Hero copy', score: 0.8 }],
    });
    const scoped = await searchGbrainContext({ query: 'hero' });
    expect(scoped.status).toBe('ok');
    if (scoped.status === 'ok') {
      expect(scoped.hits).toEqual([]);
    }
    const expanded = await searchGbrainContext({ query: 'hero', scope: 'all' });
    expect(expanded.status).toBe('ok');
    if (expanded.status === 'ok') {
      expect(expanded.scopeExpanded).toBe(true);
      expect(expanded.hits).toHaveLength(1);
    }
  });

  it('passes the parsed query, never the scope operator, to gbrain', async () => {
    hoisted.mcpCall.mockResolvedValue({ ok: true, data: [] });
    await searchGbrainContext({ query: 'scope:releases/ cosmic gate' });
    expect(hoisted.mcpCall).toHaveBeenCalledWith('search/query', {
      query: 'cosmic gate',
      limit: 8,
    });
  });

  it('clamps the limit into the existing search window', async () => {
    hoisted.mcpCall.mockResolvedValue({ ok: true, data: [] });
    await searchGbrainContext({ query: 'x', limit: 99 });
    expect(hoisted.mcpCall).toHaveBeenCalledWith('search/query', {
      query: 'x',
      limit: 20,
    });
  });
});

describe('listGbrainContextPages', () => {
  it('surfaces unavailable with the reason instead of an empty list', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: false,
      reason: 'gbrain unreachable: fetch failed',
    });
    const result = await listGbrainContextPages({ scope: 'ops/' });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('gbrain unreachable: fetch failed');
    }
  });

  it('lists a scope as a successful filtered observation', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: true,
      data: [
        { slug: 'ops/summer/shipping', title: 'Summer shipping' },
        { slug: 'marketing/hero-copy', title: 'Hero copy' },
      ],
    });
    const result = await listGbrainContextPages({ scope: 'ops/' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.pages.map(page => page.slug)).toEqual([
        'ops/summer/shipping',
      ]);
    }
  });

  it('defaults to the operations scope when none is provided', async () => {
    hoisted.mcpCall.mockResolvedValue({ ok: true, data: [] });
    const result = await listGbrainContextPages();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.scope).toBe(GBRAIN_CONTEXT_DEFAULT_SCOPE);
    }
  });

  it('never widens to all without the explicit scope', async () => {
    hoisted.mcpCall.mockResolvedValue({
      ok: true,
      data: [{ slug: 'marketing/hero-copy', title: 'Hero copy' }],
    });
    const result = await listGbrainContextPages({ scope: 'invalid' });
    expect(result.status === 'ok' && result.pages).toEqual([]);
    expect(result.status === 'ok' && result.scope).toBe('ops/');
  });
});
