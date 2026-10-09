import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./SkillDocCard-BpaIBepz.js";var i,a;function o(){return(o=e((()=>{i={generateReleasePitch:{id:`generateReleasePitch`,name:`Generate pitch`,description:`Draft a destination-aware release pitch for playlists, radio, Sirius XM, installs, playback, editorial posts, record labels, or collaborators.`,kind:`tool`,version:`1.0.0`,lifecycle:`ga`,activeVersion:`1.0.0`,entitlement:`aiCanUseTools`,model:`zai/glm-5.3-flash`,inputSchemaZodPath:`apps/web/lib/chat/tool-schemas.ts`,outputSchemaZodPath:`apps/web/components/jovie/tool-ui.tsx`,metadata:{surface:`chat`,action:`generate_release_pitch`,connector:`gmail_optional`}},analyzePackaging:{id:`analyzePackaging`,name:`Analyze packaging`,description:`Extract transcript summary, title/thumbnail promise, first-30s hook, and niche priors for a YouTube video.`,kind:`tool`,version:`1.0.0`,lifecycle:`ga`,activeVersion:`1.0.0`,entitlement:`aiCanUseTools`,model:`zai/glm-5.3-flash`,inputSchemaZodPath:`apps/web/lib/services/packaging-intelligence/types.ts`,outputSchemaZodPath:`apps/web/lib/services/packaging-intelligence/types.ts`,metadata:{surface:`youtube`,action:`analyze_packaging`,connector:`youtube`}},channelIntelligenceReport:{id:`channelIntelligenceReport`,name:`Channel intelligence report`,description:`Rank channel videos by watch-minutes-per-impression, surface face/text/topic/length correlations, and answer best/worst/working/declining questions from YouTube Reporting API metrics with sources.`,kind:`tool`,version:`1.0.0`,lifecycle:`ga`,activeVersion:`1.0.0`,entitlement:`aiCanUseTools`,model:`zai/glm-5.3-flash`,inputSchemaZodPath:`apps/web/lib/services/channel-intelligence/types.ts`,outputSchemaZodPath:`apps/web/lib/services/channel-intelligence/types.ts`,metadata:{surface:`youtube`,action:`channel_intelligence_report`,connector:`youtube`}},smart_link_switch_live:{id:`smart_link_switch_live`,name:`Switch smart link live`,description:`Flip an existing release smart link from pre-save/countdown to live DSP links. Never invent a jov.ie URL. Only switch if a smart link already exists — do not mint. Already-live is a no-op keep. Failed lookup/switch STOPs. Cite only resolved DSPs. Missing link skips; run still succeeds.`,kind:`tool`,version:`1.0.0`,lifecycle:`ga`,activeVersion:`1.0.0`,entitlement:`canEditSmartLinks`,model:`zai/glm-5.3-flash`,inputSchemaZodPath:`apps/web/lib/services/smart-link-switch/types.ts`,outputSchemaZodPath:`apps/web/lib/services/smart-link-switch/types.ts`,metadata:{surface:`smart_link`,action:`switch_live`}},fan_email_send:{id:`fan_email_send`,name:`Send fan email`,description:`Queue a fan-list email for human approval. Skip if list size is unknown or 0. Never invent ESP metrics. Never auto-send.`,kind:`tool`,version:`1.0.0`,lifecycle:`ga`,activeVersion:`1.0.0`,entitlement:`canAccessEmailCampaigns`,model:`zai/glm-5.3-flash`,inputSchemaZodPath:`apps/web/lib/services/fan-email/types.ts`,outputSchemaZodPath:`apps/web/lib/services/fan-email/types.ts`,metadata:{surface:`email`,action:`fan_send`}},retouch:{id:`retouch`,name:`Retouch image`,description:`AI retouching using the White Space style (Kodak Portra cinematic editorial). Hard identity-preservation guardrails.`,kind:`vertical_agent`,version:`1.0.0`,lifecycle:`ga`,activeVersion:`1.0.0`,entitlement:`canAccessAiRetouching`,model:`google/gemini-2.5-flash-image`,promptPath:`apps/web/lib/services/retouching/styles/white-space.md`,metadata:{surface:`image`,action:`retouch_image`,style:`white-space`,chatToolId:`retouchImage`}}},a=i})))()}var s;function c(){return(c=e((()=>{s=`# White Space Retouch Style

Use this style for Jovie AI retouching when the user asks for the White Space look: cinematic editorial polish, soft natural contrast, clean skin tone handling, and restrained Kodak Portra-inspired color.

## Intent → Action

Map the artist's words to one action. Prefer sequential single-action edits over a kitchen-sink prompt.

| Artist says | Action |
| --- | --- |
| smooth skin, blemish, polish, retouch | retouch |
| better lighting, exposure, color, enhance | enhance |
| wider, more space, uncrop, extend | extend |
| no background, new backdrop, replace background | replace_bg |

Default action is retouch. Default intensity is subtle. Keep natural skin texture.

## Non-Negotiable Guardrails

- Preserve the person's identity, face structure, age appearance, skin tone, hair, body shape, and distinctive features.
- Face identity unchanged unless the artist explicitly asked to change it.
- Always name what stays: face, age, skin tone, hair, distinctive features, and wardrobe unless replace_bg or a wardrobe change was requested.
- Do not change protected or sensitive attributes.
- Do not add or remove people, tattoos, scars, logos, jewelry, wardrobe items, or identifying marks.
- Do not sexualize the subject or make the image less safe for work.
- Do not fabricate text, signatures, documents, credentials, or brand marks.
- If the input is too low quality or ambiguous to preserve identity confidently, return a safe refusal instead of guessing.

## Preserve Clause

Keep face identity unchanged unless the artist explicitly asked to change it. Name what stays in every generation. Do not beautify into a different person.

## Visual Direction

- Keep the image photorealistic and suitable for an artist press kit, profile, or campaign asset.
- Use gentle filmic contrast, soft highlight rolloff, natural grain, and balanced warmth.
- Clean distracting artifacts, dust, compression noise, and minor lighting issues without making the subject look synthetic.
- Keep backgrounds simple and believable. Do not replace the setting unless explicitly requested and safe.
- Maintain composition, crop, camera angle, and wardrobe unless the user explicitly requests a safe adjustment.

## Output Standard

The result should feel polished but still honest: the same person, same moment, cleaner presentation.
`})))()}function l(){let e=Object.values(a),t=e.map(e=>({...e,promptContent:`promptPath`in e&&e.promptPath?d[e.promptPath]??null:null}));return(0,u.jsxs)(`div`,{"data-testid":`system-map-skills`,className:`space-y-3`,children:[(0,u.jsxs)(`p`,{className:`text-xs text-secondary-token`,children:[e.length,` skill`,e.length===1?``:`s`,` registered in SKILL_REGISTRY. Click a skill to expand its prompt doc.`]}),t.map(e=>(0,u.jsx)(r,{id:e.id,name:e.name,description:e.description,kind:e.kind,model:e.model,version:e.version,promptContent:e.promptContent},e.id))]})}var u,d;function f(){return(f=e((()=>{u=t(),o(),c(),n(),d={"apps/web/lib/services/retouching/styles/white-space.md":s}})))()}export{o as i,f as n,a as r,l as t};