/** Keep legacy probe fixtures hermetic while exercising the client injection seam. */
export function fixtureClient(fetchImpl) {
  return {
    request: async options => {
      const response = await fetchImpl(options.url, {
        headers: options.headers,
        signal: new AbortController().signal,
      });
      return { status: response.status, json: () => response.json() };
    },
  };
}
