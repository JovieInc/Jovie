# jovie-workers-ai

OpenAI-compatible `/v1/chat/completions` (streaming, tools, vision) on Cloudflare Workers, backed by the Workers AI
`AI` binding. Jovie's second model provider: Workers AI is paid from Cloudflare startup credits, the Vercel AI Gateway
is not. The binding means no Cloudflare API token exists in Vercel, CI or Doppler.

- Auth: one shared bearer, Worker secret `WORKERS_AI_BEARER` (`wrangler secret put`), mirrored as `WORKERS_AI_TOKEN`
  (Vercel `jovie-web` env, CI secret `GOLDEN_PATH_REVIEW_WORKERS_AI_TOKEN`). Never a var in `wrangler.toml`.
- Allowlist: `@cf/zai-org/glm-5.3-flash` and `@cf/zai-org/glm-5.3` only (the Gateway models, same weights). Output capped
  at 16,384 tokens, body at 8 MiB. 300 requests/minute.
- Routing policy lives in `apps/web/lib/ai/routing.json`; `WORKERS_AI_BASE_URL` points at `<worker>/v1`.

Test: `node --experimental-strip-types --test infra/workers-ai-relay/src/index.test.mjs`
Deploy: `cd infra/workers-ai-relay && wrangler deploy`
