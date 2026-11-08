// Shared fakes for the prod-cert receipt tests: a served build at SHA and
// a production origin whose anonymous pages all render.

export const SHA = 'a'.repeat(40);
export const T = '2026-10-28T20:00:00.000Z';
export const check = (status, id = 'c') => ({
  id,
  status,
  startedAt: T,
  endedAt: T,
  summary: 's',
});

/** @param {{ failPath?: string, sha?: string }} [options] */
export function fakeFetch({ failPath, sha = SHA } = {}) {
  return async url => {
    const u = new URL(url);
    const html = (body, status = 200) =>
      new Response(body, { status, headers: { 'content-type': 'text/html' } });
    if (u.pathname === '/api/health/build-info') {
      return new Response(
        JSON.stringify({ commitSha: sha, deploymentId: 'dpl_1' })
      );
    }
    if (u.pathname === failPath) return html('boom', 500);
    if (u.pathname === '/api/handle/check') {
      const taken = u.searchParams.get('handle') === 'tim';
      return new Response(
        JSON.stringify(
          taken ? { available: false, reason: 'taken' } : { available: true }
        )
      );
    }
    if (u.pathname === '/og.png') {
      return new Response('x', { headers: { 'content-type': 'image/png' } });
    }
    if (u.pathname === '/tim') {
      return html(
        '<title>Tim</title><h1>Tim</h1><meta property="og:image" content="/og.png"/><a href="/tim/song-1">s</a>'
      );
    }
    if (u.pathname === '/tim/song-1') {
      return html(
        '<title>Song</title><meta property="og:image" content="/og.png"/>'
      );
    }
    if (u.pathname === '/signin')
      return html('<title>Sign in</title><input type="email">');
    return html(
      '<title>Jovie</title><a href="/signup">s</a><a href="/claim?plan=pro">p</a>'
    );
  };
}
