---
name: youtube-thumbnail-growth
description: Create, review, revise, and compare YouTube thumbnail challengers intended to improve qualified clicks and channel growth. Use for thumbnail concepts, approval portfolios, model bake-offs, VideoContextPack preparation, portrait and skin-tone QA, mobile-legibility review, controlled experiments, and evidence-backed thumbnail refreshes for existing or new videos.
---

# YouTube Thumbnail Growth

## Positioning and benefit

Optimize for qualified viewer response and downstream channel growth, not prettier images. Produce truthful, video-specific challengers that earn an informed click, set the right expectation, and can be tested against a recorded baseline. Treat visual polish as a means, never the success metric.

Never promise lift before measurement. Describe each concept as a conversion hypothesis supported by cited context. Report actual growth only from an approved experiment with real analytics.

## Required resources

Read these files before generating or reviewing a thumbnail:

- [VideoContextPack and QA contract](references/video-context-pack.schema.json): canonical machine-readable input, provenance, cache, Channel Identity Pack, subject-role evidence, candidate, and batch-QA requirements.
- [Creative brief template](assets/thumbnail-creative-brief.md): create one completed brief per video and lock it before generation or provider comparison.
- [Founder feedback examples](references/founder-feedback-examples.md): durable examples of locks, rejections, and revision behavior. Use examples as guardrails, not as generic packaging to copy.
- [xAI Grok Imagine adapter](references/xai-grok-imagine-adapter.md): binding request, prompt-adaptation, cost-control, download, and receipt rules for xAI comparisons.

## Workflow

1. Build one `VideoContextPack` keyed by `channelId/videoId`. Use only authorized, provenance-recorded sources. Include canonical metadata and current thumbnail, selected source frames, permitted transcript excerpts, analytics baseline when available, the channel's `ChannelIdentityPack`, content hashes, cache expiry, and retrieval budgets.
2. Build or resolve the `ChannelIdentityPack` before briefing. Identify channel creators from first-party channel/profile evidence plus repeated verified appearances. Admit only founder/customer-approved or high-confidence, reference-quality creator assets. Detect a featured guest or Featured Collaborator from the video's title, description, metadata, transcript, and existing frames; admit that person only when material relevance is established and a clear real approved/reference-quality image exists.
3. Fail closed when required context is absent, stale, contradictory, low quality, or unverified. Exclude the video instead of inventing context, props, a premise, a person, or a claim.
4. Complete and lock the creative brief. State the truthful viewer promise, conversion hypothesis, source evidence, copy, composition, subject role (`creator`, `featured_collaborator`, `featured_guest`, or `no_person`), portrait plan, text hierarchy, color rationale, props, mobile plan, and acceptance rubric.
5. Run the pre-generation semantic/visual gate. In a two-second feed scan, the headline and dominant visual must communicate one non-confusing, video-specific viewer promise. Reject generic cover art, news-report graphics, decorative creator-name lower thirds, or a layout that could fit an unrelated video.
6. Generate distinct candidates from the locked pack and brief. Pass the same locked identity/source images as actual model inputs for every provider that depicts a person. Do not use generic `DAY`, vague shock, interchangeable creator packaging, or an unknown/generated-person substitution. Preserve recognizable source-frame and prop realism.
7. Run per-card QA at full size and mobile size. Reject failures; do not rationalize them for founder review.
8. Run a same-scale portfolio contact-sheet QA for cross-card identity, skin, visual repetition, text hierarchy, and accidental color drift.
9. Present approval-only challengers with video title/URL, current-to-challenger context, concise hypothesis, provenance status, and image. Do not publish, swap, contact anyone, or modify YouTube without explicit approval for the exact mutation.
10. Keep approved assets locked but unpublished until Jovie's real YouTube connector and upload UI are merged, deployed, and runtime-proven. Never use a direct YouTube API call, script, consumer UI, or alternate connector as an upload fallback.
11. Before any Jovie-mediated upload, read back the exact target channel ID/title and granted scopes. Require an exact founder-approved image-to-video mapping; apply one mapping at a time, capture before/after screenshots, and append the result to an upload ledger. Stop on any identity, scope, mapping, or runtime mismatch.
12. After approval and Jovie-mediated upload, use a controlled experiment with a recorded baseline, measurement window, and outcome. Cite observed evidence; do not attribute normal variance to the thumbnail without sufficient data.

## Generation rules

### Content and claims

- Express one specific, truthful viewer promise grounded in the locked pack.
- Preserve material facts. Do not add people, products, locations, outcomes, scale, money, conflict, or events unsupported by evidence.
- Prefer a surprising verified detail over a common premise. If the hook could fit many unrelated videos, re-brief it.
- The headline and dominant visual must jointly communicate the same clear viewer promise at feed size. Reject semantic mismatch, ambiguity, or a visual that reads as generic cover art/news graphics instead of a scene or tension specific to the source.
- Creator names, verification badges, location lower thirds, and news-style nameplates are forbidden as decorative filler. Use headline-only by default; add a second line only when it is video-specific and necessary for comprehension.
- Require intentional subject treatment, cutout/depth relationship, and source-grounded background hierarchy. A bland portrait on an arbitrary backdrop is not a concept.
- Record the source IDs or timestamps supporting the headline, props, setting, and emotional framing.
- Never claim predicted CTR, views, subscribers, revenue, or growth as fact.
- Never invent, hallucinate, or render readable fake lyrics, songwriting lines, notebook prose, or quotations. For every music video, readable lyric text is allowed only when the exact lines are supplied or verified in the locked pack and explicitly approved for thumbnail use. Otherwise use no page text, abstract illegible handwriting texture, or a factual visual substitute.

### Portrait and identity

- Every recognizable depicted person must have locked subject-role evidence: `creator`, `featured_collaborator`, or `featured_guest`. Use `no_person` when no human is needed. An unnamed third party may appear only as a non-identifying back-of-head, silhouette, cropped body/hands, or environmental presence when that treatment is semantically justified; never synthesize a recognizable face.
- Match the selected Channel Identity Pack subject under the intended scene lighting: face proportions, natural skin hue/luminance/contrast, hair color, eye color, and distinguishing features.
- Each creator entry must include a `CreatorAppearanceProfile` with one fixed color-master asset and approved angle/proportion references. Use that master to normalize complexion, white balance, facial contrast, hair, and eye appearance across every output and the batch contact sheet while preserving credible scene-specific lighting.
- A color master must be explicitly approved as a truthful natural-complexion reference independently of a candidate comparison. "Best of this set," "closest," or "least wrong" does not promote a generated candidate into the Creator Appearance Profile. If every reviewed candidate fails portrait or complexion QA, reject the whole set, preserve only explicitly approved composition ideas, and select a new verified source portrait before regenerating.
- The Creator Appearance Profile must also record approved wardrobe assets and source-video wardrobe evidence. Depict only evidenced/approved creator styling; never invent clothing or shoes that conflict with established style. For Tim, skinny jeans are prohibited unless explicitly evidenced and approved. When lower-body or shoe evidence is insufficient, use a neutral/source-faithful crop or semantically justified occlusion instead of guessing.
- Default to verified channel creator images. Do not suppress a real materially featured collaborator: when title/description/transcript/frames establish their role and a clear real approved/reference-quality image exists, label them internally as `featured_collaborator` and preserve only their faithful likeness. If either relevance evidence or reference quality is missing, omit their face rather than approximate or substitute it.
- Never substitute an unknown, stock-like, generic, or newly synthesized identity for a creator or guest. If the required reference inputs cannot be passed to a provider, mark that provider candidate blocked.
- When the face is forward or visible, require clearly visible, sharp, in-focus, sufficiently lit, readable eyes. Allow closed eyes or a look-away/side profile only when the verified creative intent requires it.
- Use the most flattering truthful source angle and expression available. Reject distorted, uncanny, corrupted, poorly lit, soft, muddy, obscured, or identity-drifted faces.
- Preserve natural skin texture. Prohibit whitening, orange/bronze drift, gray/green casts, plastic smoothing, artificial eye enlargement, beauty manipulation, or identity-altering retouch.
- Compare every candidate to the fixed color master at the individual QA gate and again in the same-scale contact sheet. Reject complexion that is materially warmer, paler, grayer, greener, flatter, or more contrasty than the profile permits; do not average inconsistent generated outputs into a new reference.
- Never calibrate one generated portrait from another rejected generated portrait. Skin normalization must resolve back to the explicitly approved, provenance-cited source color master.
- A back-to-camera source can remain a factual ingredient, but pair it with a verified, flattering face when the hierarchy needs human connection.

### Text and mobile hierarchy

- Use one deliberate headline hierarchy readable at mobile size.
- Treat every line break as designed. Reject awkward splits, accidental orphan words, ambiguous phrases, crowding, low contrast, and text that competes with the face or factual visual.
- Render a mobile/feed-size preview and evaluate every word against its own local image background, not a global average. Reject any word that loses legibility at that size.
- Repair local contrast deliberately with a restrained scrim, stroke, shadow, repositioning, or a different accent. Never rely on hue or color alone to carry text meaning or separation.
- Use the shortest copy that preserves the specific promise. No generic packaging.

### Color and finish

- Default to a neutral or Jovie-consistent base.
- Use an accent only when derived from the verified video's visual world or a defined semantic such as danger or urgency that does not contradict the video. Record the rationale in the brief.
- Never add arbitrary blue/red lines, glows, arrows, or accents.
- Test color only as an explicit single-variable experiment: keep composition, copy, portrait, crop, and all other variables identical; predeclare the hypothesis.
- Harmonize the existing scene, restore natural skin, preserve scene-specific lighting, sharpen carefully, and upscale after identity QA. Avoid overprocessing.

## Provider bake-offs

For a model or provider comparison, use exactly the same locked `VideoContextPack`, Channel Identity Pack subject, actual reference-image inputs, creative brief, composition, copy, aspect ratio, resolution, and acceptance rubric. Change only provider/model and necessary adapter syntax. Record provider, exact model ID/version, request time, usage/cost, revised prompt adapter, and C2PA/provenance data when available. Reference-free text generation is not a valid identity comparison.

Blind the review labels and keep the provider manifest separate. Score both outputs with the same rubric: identity fidelity, eyes, skin consistency, text accuracy, factual grounding, prop realism, mobile hierarchy, and fit with the conversion hypothesis. Make no winner claim before founder review.

Use the provider's official image API. Verify current model IDs against first-party documentation. If authorization, billing, or the exact required provider is unavailable, stop at the one-time authorization boundary; never substitute a consumer chat or another provider.

For xAI Grok Imagine work, follow the binding adapter reference. Keep the creative brief invariant while translating it into provider-native prompt scaffolding; identical semantics do not require a blind, byte-identical prompt transplant.

## Acceptance checklist

A candidate is founder-ready only when every applicable item passes:

- Pack is complete, current, hashed, provenance-cited, and within retrieval/token/asset budgets.
- Promise and hypothesis are video-specific, truthful, and non-generic.
- Two-second semantic/visual gate passes: clear non-confusing promise, specific source cue, intentional portrait/cutout/background treatment, and no generic cover/news framing.
- Headline, scene, people, props, and emotional framing are evidence-backed.
- Any readable lyric/songwriting/notebook text is exact, source-verified, and approved; otherwise the candidate contains no readable pseudo-lyrics.
- Subject role is explicit and evidence-backed; every depicted person resolves to an approved/high-confidence creator or qualified featured guest in the Channel Identity Pack.
- The provider received the locked reference images as actual inputs; no unknown/generated-person substitution is present.
- Identity matches the canonical reference; face is natural and flattering.
- The complexion master has an explicit independent approval record; it was not inferred from a relative preference among generated candidates.
- Visible eyes are clear, sharp, well lit, and readable.
- Skin is natural under scene lighting and consistent with the portfolio contact sheet.
- No distortion, corruption, uncanny detail, beauty manipulation, or synthetic prop failure is visible.
- Creator wardrobe and shoes are traceable to approved references/source-video evidence; unsupported styling is cropped or omitted.
- Text is exact, deliberately broken, and mobile-legible.
- Every word passes local-background contrast at the rendered mobile preview size; no word depends on color alone.
- Accent color has a documented video-world or semantic rationale; no incidental drift exists.
- Mobile preview and per-card QA pass.
- Contact-sheet batch QA passes for identity, skin, repetition, and color consistency.
- Creator appearance matches the fixed color-master reference across the batch; normalization is a preservation pass, never permission to reshape or beautify the face.
- Founder locks are preserved and explicit rejections are not resurfaced.
- Output is marked approval-only unless exact publishing authority has been granted.

## Revision protocol

1. Record the founder decision as `lock`, `reject`, or `revise` with the affected card and reason codes.
2. Freeze locked cards. Do not redesign or silently regenerate them.
3. For a rejection, discard the rejected candidate as review output. Preserve only the explicitly approved premise or ingredient.
4. For a revision, change only the requested variables unless a QA gate requires regeneration. Re-run every dependent gate, including the batch contact sheet.
5. Replace the review card; do not present the dead version again except in an explicitly requested audit.
6. Record the revised candidate hash, prior candidate hash, change rationale, QA results, and status `awaiting_founder_approval`.

## Publication protocol

- Default state is `approval_only`; generation and founder approval do not grant upload authority.
- Upload exclusively through Jovie after the YouTube connector/UI prerequisite has merge proof, deploy proof, and runtime proof. Do not fall back to direct APIs, scripts, YouTube Studio, or another connector.
- Read back and display the exact connected channel ID, channel title, and granted OAuth scopes before the first mutation. For the Tim channel, the expected identity is `UC90tJdD38139ytPUdEZVl1A` / `Tim White`; a match must still be verified at runtime.
- Accept only an already-approved artifact hash mapped to one exact video ID. Apply mappings one at a time; never rotate a batch atomically or infer a mapping from filenames.
- Capture a pre-upload screenshot, Jovie mapping/confirmation screenshot, and post-upload channel screenshot. Append timestamp, channel ID/title, scopes, video ID/title, old thumbnail hash, approved artifact hash, Jovie operation ID, result, and evidence paths to the upload ledger.
- Stop fail-closed on missing scope, stale approval, artifact hash mismatch, channel mismatch, ambiguous video title/ID, Jovie runtime error, or absent screenshot evidence.

## Claim guardrails

Say `designed to test`, `conversion hypothesis`, `evidence-backed premise`, or `awaiting measurement`. Do not say `will increase CTR`, `winner`, `improved growth`, or similar causal claims before measured evidence. Keep source/design approval, provider execution, YouTube publication, analytics measurement, and growth proof as separate evidence tiers.
