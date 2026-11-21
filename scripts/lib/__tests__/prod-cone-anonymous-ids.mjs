import { anonymousChecks } from '../prod-cert.mjs';

/** All check ids the anonymous HTTP probes produce, per surface. */
export async function anonymousCheckIds() {
  const fakeResponse = {
    status: 200,
    ok: true,
    text: async () => '<html><title>x</title></html>',
    headers: new Map(),
    url: 'https://jov.ie/',
  };
  /** @type {typeof fetch} */
  const fakeFetch = async () => /** @type {any} */ (fakeResponse);
  const probes = anonymousChecks({
    origin: 'https://jov.ie',
    fetchImpl: fakeFetch,
    coneCases: true,
  });
  const ids = {};
  for (const [surface, fns] of Object.entries(probes)) {
    ids[surface] = [];
    for (const pending of fns()) ids[surface].push((await pending).id);
  }
  return ids;
}
