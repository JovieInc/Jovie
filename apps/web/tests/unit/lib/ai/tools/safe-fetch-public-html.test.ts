import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
}));

// node:dns/promises is the only DNS path used by isPrivateHostname.
vi.mock('node:dns/promises', () => ({
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

// Mock the logger to keep test output clean.
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import AFTER mocks so the mocked dns is captured.
const { safeFetchPublicHtml } = await import(
  '@/lib/ai/tools/safe-fetch-public-html'
);

const PUBLIC_IPV4 = '93.184.216.34';

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

function fetchMock(impl: (url: string) => Response): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    return impl(url);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  mockLookup.mockReset();
  // Default: every hostname resolves to a public IP.
  mockLookup.mockResolvedValue([{ address: PUBLIC_IPV4, family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeFetchPublicHtml — happy path', () => {
  it('fetches HTML, returns body and final URL', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(() =>
        htmlResponse('<html><head><title>Tim</title></head></html>')
      )
    );

    const result = await safeFetchPublicHtml('https://example.com/bio');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finalUrl).toBe('https://example.com/bio');
    expect(result.html).toContain('<title>Tim</title>');
    expect(result.sourceTitle).toBe('Tim');
  });

  it('strips URLs and control chars from sourceTitle', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(() =>
        htmlResponse(
          '<html><head><title>BUY $XYZ at https://evil.com/promo</title></head></html>'
        )
      )
    );

    const result = await safeFetchPublicHtml('https://example.com/bio');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceTitle).toBeDefined();
    expect(result.sourceTitle).not.toContain('http');
    expect(result.sourceTitle).not.toContain('evil.com');
  });
});

describe('safeFetchPublicHtml — URL validation', () => {
  it('rejects non-https URLs', async () => {
    const result = await safeFetchPublicHtml('http://example.com');
    expect(result).toEqual({ ok: false, error: 'blocked_host' });
  });

  it('rejects userinfo in URL', async () => {
    const result = await safeFetchPublicHtml('https://evil.com@10.0.0.1/');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // userinfo is rejected before hostname classification
    expect(result.error).toBe('invalid_url');
  });

  it('rejects trailing-dot hostnames', async () => {
    const result = await safeFetchPublicHtml('https://localhost./');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed URLs', async () => {
    const result = await safeFetchPublicHtml('not a url');
    expect(result).toEqual({ ok: false, error: 'invalid_url' });
  });
});

describe('safeFetchPublicHtml — SSRF guards', () => {
  it.each([
    ['https://10.0.0.1/'],
    ['https://127.0.0.1/'],
    ['https://192.168.1.1/'],
    ['https://172.16.0.1/'],
    ['https://169.254.169.254/'],
    ['https://0.0.0.0/'],
    ['https://[::1]/'],
    ['https://[fe80::1]/'],
    ['https://localhost/'],
    ['https://foo.internal/'],
    ['https://foo.local/'],
    ['https://metadata.google.internal/'],
  ])('rejects %s as blocked_host', async url => {
    const result = await safeFetchPublicHtml(url);
    expect(result).toEqual({ ok: false, error: 'blocked_host' });
  });

  it('rejects a public-looking hostname that resolves to a private IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    const result = await safeFetchPublicHtml('https://sneaky.example.com/');
    expect(result).toEqual({ ok: false, error: 'blocked_host' });
  });
});

describe('safeFetchPublicHtml — redirects', () => {
  it('follows up to 3 redirects then succeeds', async () => {
    let hops = 0;
    vi.stubGlobal(
      'fetch',
      fetchMock(url => {
        hops++;
        if (url === 'https://example.com/start') {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://example.com/step2' },
          });
        }
        if (url === 'https://example.com/step2') {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://example.com/final' },
          });
        }
        return htmlResponse('<html><body>final</body></html>');
      })
    );

    const result = await safeFetchPublicHtml('https://example.com/start');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.finalUrl).toBe('https://example.com/final');
    expect(hops).toBe(3);
  });

  it('rejects redirect chain that points at a private IP', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(url => {
        if (url === 'https://example.com/start') {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://10.0.0.1/admin' },
          });
        }
        return htmlResponse('should not reach');
      })
    );

    const result = await safeFetchPublicHtml('https://example.com/start');
    expect(result).toEqual({ ok: false, error: 'blocked_host' });
  });

  it('catches DNS rebinding across hops', async () => {
    // First lookup (initial URL): public. Second (redirect target): private.
    mockLookup
      .mockResolvedValueOnce([{ address: PUBLIC_IPV4, family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);

    vi.stubGlobal(
      'fetch',
      fetchMock(url => {
        if (url === 'https://example.com/start') {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://later.example.com/' },
          });
        }
        return htmlResponse('should not reach');
      })
    );

    const result = await safeFetchPublicHtml('https://example.com/start');
    expect(result).toEqual({ ok: false, error: 'blocked_host' });
  });

  it('rejects more than 3 redirects', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(url => {
        const next = url.replace(
          /\/h(\d+)/,
          (_, n) => `/h${Number.parseInt(n, 10) + 1}`
        );
        return new Response(null, {
          status: 302,
          headers: { location: next },
        });
      })
    );

    const result = await safeFetchPublicHtml('https://example.com/h1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('fetch_failed');
  });

  it('treats redirect to a known auth-wall host as auth_walled', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://accounts.google.com/signin' },
          })
      )
    );

    const result = await safeFetchPublicHtml('https://example.com/private');
    expect(result).toEqual({ ok: false, error: 'auth_walled' });
  });
});

describe('safeFetchPublicHtml — content-type and size', () => {
  it('rejects non-HTML content types', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(
        () =>
          new Response('PDF data', {
            status: 200,
            headers: { 'content-type': 'application/pdf' },
          })
      )
    );

    const result = await safeFetchPublicHtml('https://example.com/file.pdf');
    expect(result).toEqual({ ok: false, error: 'not_html' });
  });

  it('rejects bodies larger than the cap via content-length', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(
        () =>
          new Response('<html></html>', {
            status: 200,
            headers: {
              'content-type': 'text/html',
              'content-length': String(2 * 1024 * 1024),
            },
          })
      )
    );

    const result = await safeFetchPublicHtml('https://example.com/big');
    expect(result).toEqual({ ok: false, error: 'too_large' });
  });
});

describe('safeFetchPublicHtml — auth walls and errors', () => {
  it('flags 401 responses as auth_walled', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(
        () =>
          new Response('login required', {
            status: 401,
            headers: {
              'content-type': 'text/html',
              'www-authenticate': 'Basic realm="x"',
            },
          })
      )
    );

    const result = await safeFetchPublicHtml('https://example.com/walled');
    expect(result).toEqual({ ok: false, error: 'auth_walled' });
  });

  it('returns fetch_failed on 5xx', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock(
        () =>
          new Response('server error', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          })
      )
    );

    const result = await safeFetchPublicHtml('https://example.com/down');
    expect(result).toEqual({ ok: false, error: 'fetch_failed' });
  });

  it('returns timeout when fetch aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }) as unknown as typeof fetch
    );

    const result = await safeFetchPublicHtml('https://example.com/slow');
    expect(result).toEqual({ ok: false, error: 'timeout' });
  });
});
