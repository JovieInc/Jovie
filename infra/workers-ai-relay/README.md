# jovie-workers-ai

OpenAI-compatible `/v1/chat/completions` (streaming, tools, vision) and `/v1/embeddings` on Cloudflare Workers, backed by the Workers AI
`AI` binding. Jovie's second model provider: Workers AI is paid from Cloudflare startup credits, the Vercel AI Gateway
is not. The binding means no Cloudflare API token exists in Vercel, CI or Doppler.

- Auth: one shared bearer, Worker secret `WORKERS_AI_BEARER` (`wrangler secret put`), mirrored as `WORKERS_AI_TOKEN`
  (Vercel `jovie` env, CI secret `GOLDEN_PATH_REVIEW_WORKERS_AI_TOKEN`). Never a var in `wrangler.toml`.
- Allowlist: `@cf/deepseek-ai/deepseek-v4.1-flash-1017` and `@cf/zai-org/glm-5.3` only. Cloudflare retired the
  previous `@cf/zai-org/glm-5.3-flash` on 2026-11-20 (410 Gone); the flash tier is now the DeepSeek v4.1 flash
  successor (JOV-13141), the non-flash GLM stays (not on the retirement list). Output capped
  at 16,384 tokens, body at 8 MiB. 300 requests/minute.
- Embeddings: `@cf/baai/bge-m3` only (1024 dims, inputs truncated at the model limit, up to 512 inputs per request,
  batched 100 per Workers AI call). Separate 600 requests/minute bucket (`EMBED_LIMITER`). Used by gbrain
  (`litellm:@cf/baai/bge-m3`, decision `decisions/engineering/gbrain-embeddings-workers-ai-2026-10-31`).
- Routing policy lives in `apps/web/lib/ai/routing.json`; `WORKERS_AI_BASE_URL` points at `<worker>/v1`.

Test: `node --experimental-strip-types --test infra/workers-ai-relay/src/index.test.mjs`
Deploy: `cd infra/workers-ai-relay && wrangler deploy`
