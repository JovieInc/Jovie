import { firstPartyMetadata, markedUserAgent } from './traffic-evidence.mjs';

/** Explicit fetches share page admission. Return manual redirects so credentials
 * cannot follow a foreign hop. Buffer health/sitemap bodies at most 5 MiB so
 * every public body API and clone has a terminal state. Sizes remain unknown.
 * @param {{origin:string, evidence:any, metadata?:Record<string,string>,
 * deadlineEpochMs?:number, fetchImpl?:typeof fetch}} config
 */
export function createDirectFetch({
  origin,
  evidence,
  metadata = {},
  deadlineEpochMs = Infinity,
  fetchImpl = globalThis.fetch,
}) {
  return async (input, /** @type {RequestInit} */ options = {}) => {
    const url = String(input);
    const request = { url, resourceType: 'fetch' };
    if (!evidence.admit(request, { direct: true }).allowed) {
      await evidence.finished(request);
      throw new Error('crawl direct request admission stopped');
    }
    let headers = Object.fromEntries(new Headers(options.headers));
    headers['user-agent'] = markedUserAgent(headers['user-agent'] || 'node');
    if (new URL(url).origin === new URL(origin).origin)
      headers = firstPartyMetadata(url, origin, headers, metadata);
    else
      for (const name of Object.keys(headers))
        if (
          /^x-jovie-crawl-|^x-synthetic-monitoring$|^x-vercel-protection-bypass$|^x-vercel-set-bypass-cookie$|^cookie$|^authorization$|^proxy-authorization$/u.test(
            name
          )
        )
          delete headers[name];
    const timeout = AbortSignal.timeout(
      Math.max(1, Math.min(20_000, deadlineEpochMs - Date.now()))
    );
    try {
      const response = await fetchImpl(input, {
        ...options,
        headers,
        redirect: 'manual',
        signal: options.signal
          ? AbortSignal.any([options.signal, timeout])
          : timeout,
      });
      evidence.response(request, response.status);
      const chunks = [];
      let length = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 5 * 1024 * 1024)
              throw new Error('crawl direct response exceeds 5 MiB');
            chunks.push(value);
          }
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        } finally {
          reader.releaseLock();
        }
      }
      const buffered = new Response(
        response.body ? Buffer.concat(chunks) : null,
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }
      );
      // Existing exact-deployment checks require the original transport URL.
      Object.defineProperty(buffered, 'url', { value: response.url });
      return buffered;
    } catch (error) {
      evidence.failed(request);
      throw error;
    } finally {
      await evidence.finished(request);
    }
  };
}
