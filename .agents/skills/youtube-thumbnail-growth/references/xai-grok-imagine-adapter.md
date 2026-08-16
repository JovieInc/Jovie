# xAI Grok Imagine provider adapter

Use this adapter as the binding xAI reference for thumbnail bake-offs. Source: [xAI Image Generation guide](https://docs.x.ai/developers/model-capabilities/images/generation), updated August 13, 2026 per founder-supplied provenance.

## Request contract

- Use `POST https://api.x.ai/v1/images/generations` only for a verified `no_person` brief. When a creator or featured guest is depicted, use the official image-editing endpoint `POST https://api.x.ai/v1/images/edits` and supply the locked Channel Identity Pack images as actual inputs. A text-only identity request is invalid.
- Request model `grok-imagine-image-2.0`, then query the authenticated account model list and record the actual resolved model/version before generation.
- Use `aspect_ratio: "16:9"` for YouTube thumbnails.
- Use `resolution: "1k"` and `quality: "medium"` for the initial ten-video comparison batch. Keep total Grok spend under USD 5.
- Use `response_format: "b64_json"` when supported for immediate deterministic persistence. If the API returns a temporary URL, download it immediately, verify the content type, hash the bytes, and store the stable local artifact path.
- For identity edits, send the same ordered reference set used by the comparison provider, up to xAI's documented input limit. Record each non-sensitive asset ID, content hash, role, order, and whether the API accepted it.
- Record response usage/cost, requested model, resolved model, endpoint, request time, aspect ratio, resolution, quality, response format, moderation result, artifact hash, and available C2PA/provenance.
- Queue 2k regeneration only for founder-selected finalists needing higher-resolution review.
- Use `n` only for multiple images from the same locked prompt. Use bounded concurrent requests for distinct video prompts while preserving one receipt per request.

## Provider-native prompt scaffolding

Keep the locked VideoContextPack, references, viewer promise, hypothesis, composition, exact copy, aspect ratio, resolution, and acceptance rubric invariant. Adapt only syntax and provider-native prompt structure.

For Grok, state the scene cinematographically and explicitly:

1. Name the verified subject, role (`creator` or `featured_guest`), reference asset IDs, and environment. For `no_person`, explicitly prohibit all human figures and faces.
2. Specify composition, crop, foreground obstruction, depth layers, and depth of field.
3. Specify the truthful expression, head angle, gaze direction, and which facial features must remain sharp and in focus.
4. Require visible, sharp, well-lit eyes for a forward face; allow closed eyes or look-away only when the locked intent says so.
5. Require faithful, flattering likeness, canonical skin-tone consistency under scene lighting, natural texture, and no corrupted or distorted face.
6. Specify verified props and source-frame realism.
7. State the exact headline and deliberate line breaks.
8. State the documented base palette and any evidence-backed or semantic accent rationale.

Do not blindly transplant OpenAI prompt prose. Translate the same locked brief into the clearest provider-native request and record the adapter delta in the provider receipt.

## Comparison rules

- Label outputs blindly in the founder review and disclose providers only in the separate manifest.
- Apply the same per-card and contact-sheet QA gates to both providers.
- Reject any output whose depicted person cannot be resolved to the locked Channel Identity Pack subject. Quarantine generic-person outputs; preserve only non-identity layout ideas.
- Do not conclude a winner before founder review.
- Do not regenerate only one provider to rescue a failed comparison unless the failure is an API/runtime error; a creative QA failure is part of the evaluated output and must be recorded.
