export const jsonResponse = (
  body,
  { status = 200, contentType = 'application/json', headers = {} } = {}
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': contentType, ...headers }),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

export function concurrentRateLimitedFetches(count) {
  const requests = [];
  let admitAll = () => {};
  const allAdmitted = new Promise(resolve => {
    admitAll = () => resolve(undefined);
  });
  return {
    requests,
    fetchFor: seconds => async () => {
      requests.push(seconds);
      if (requests.length === count) admitAll();
      // Every request must pass cooldown admission before any response
      // publishes a reset. Otherwise a short cooldown can correctly prevent
      // a longer request from reaching fetch at all.
      await allAdmitted;
      return jsonResponse(
        {},
        { status: 429, headers: { 'retry-after': String(seconds) } }
      );
    },
  };
}
