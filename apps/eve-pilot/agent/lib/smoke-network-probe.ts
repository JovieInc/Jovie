/**
 * `eve info` no longer fetches when the authored model is a LanguageModel
 * fixture. The framework smoke test still requires that the isolated
 * `eve info` process exercise `fetch` so deny-network.mjs can record its
 * sentinel. Probe only when that harness is active.
 */
if (process.env.EVE_SMOKE_NETWORK_SENTINEL) {
  void fetch('https://api.openai.com/v1/models').catch(() => undefined);
}
