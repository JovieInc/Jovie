# ChatGPT app directory: Jovie artists

Retrieved 2026-10-02 from OpenAI's current plugin docs. This file prepares a
listing. It does not submit the plugin, spend money, change DNS, or turn any
flag on.

Official sources:

- [Plugin guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines)
- [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission)
- [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
- [Authentication](https://developers.openai.com/plugins/build/auth)
- [MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Build a plugin](https://developers.openai.com/plugins/build/plugins)
- [Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)

The retired `ai-plugin.json` format is not the listing format. The package is
the Agent Plugins ZIP described on the submission page: `plugin.json` at the
archive root, `mcp.json`, and relative asset paths.

## What this listing is

ChatGPT suggests one HTTPS MCP URL. The directory app is anonymous. Four tools
are read-only; `make_link` is a flagged write:

| Tool | What it does |
| --- | --- |
| `find_artist` | Up to five public profile candidates. A name match is a candidate, including a single match. |
| `get_profile` | Public name, bio, genres, profile URL, and public listening links for an exact handle. |
| `get_updates` | Up to eight public releases and eight confirmed upcoming shows. |
| `make_link` | One unclaimed public Jovie page for a track URL, ISRC, or artist/track name. |
| `subscribe_to_updates` | The public page `https://jov.ie/{username}?mode=subscribe`. It does not collect contact details or create a subscription. |

Production URL, only after the flag below is enabled and the app is redeployed:
`https://jov.ie/api/chatgpt/mcp`.

**Ship now:** the endpoint, package, and this doc, with the flag defaulting off.
**Re-evaluate when:** the production flag is on and OpenAI's tool scan finishes.
**Then:** submit from Tim's OpenAI account. Do not enable dynamic client
registration for this listing.

**EVENT:** the directory MCP stays anonymous. Its four artist-directory tools
are read-only. `make_link` is an explicit, default-off write that creates an
unclaimed public page. Owner tools stay on the per-username OAuth endpoint.
Dynamic client registration stays off.

## Requirement map

| Requirement | What Jovie already has | Gap | Who |
| --- | --- | --- | --- |
| One universal HTTPS MCP URL | Per-artist `/api/mcp/{username}` and music `/api/music/mcp` exist, but neither is the directory shape (see below). | New `/api/chatgpt/mcp`, implemented, default off. | This PR. Tim enables the flag before scan. |
| Auth mode | OAuth discovery, 401 plus `WWW-Authenticate`, and the ChatGPT redirect allowlist are live for the per-artist owner endpoint. Dynamic client registration is behind `FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION`, default off. | Directory listing is `noauth`. ChatGPT does not need dynamic client registration. Leave that flag off. Jovie does not advertise `client_id_metadata_document_supported`. | Tim: do not turn the registration flag on. |
| Tool annotations | Music MCP annotates its own tools. The per-artist route does not. | The four directory reads remain read-only. `make_link` sets `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, and `openWorldHint: true`. | This PR. |
| Privacy policy URL | `https://jov.ie/legal/privacy` (and `/privacy` redirects there). The Feb 2026 policy covers collection, purposes, sharing, retention, controls, and under-13. | It does not name ChatGPT or OpenAI as a caller of these public tools. This PR does not rewrite legal copy. | Counsel, before submit, if review requires that sentence. |
| Terms URL | `https://jov.ie/legal/terms` (and `/terms` redirects there). | None for the URL itself. | Tim pastes the canonical URL. |
| Support and website | `https://jov.ie/support`, `https://jov.ie`. Support email `support@jov.ie`. | None. | Tim. |
| App metadata and icons | Brand mark exists. Music plugin metadata is a different product. | `apps/web/plugins/jovie-artists/` with square SVG logo and composer icons, name, subtitle, category Entertainment, brand color `#635aff`. | This PR. Tim uploads the ZIP. |
| Review cases | None for this server. | Six positive and four negative cases in `plugin.json`. No demo URL in git. | Tim records the walkthrough after both flags are on. |
| Domain verification | `jov.ie` already serves the app. | The challenge route reads `OPENAI_APPS_CHALLENGE` at request time and 404s when unset. No token is committed. | Tim sets the token at submission time. |
| Identity verification and submit | OpenAI account is Tim's. | Not started. No spend and no submission from this change. | Tim. |

## Why this URL

`/api/mcp/{username}` is a tenant URL. Owner tools return 401. A directory
connector cannot search an arbitrary artist from a template path, and an
authenticated listing would need a reviewer login.

`/api/music/mcp` searches Spotify and Apple Music identities. Its origin check
allows only the Jovie app origin, so a ChatGPT `Origin` is rejected. It is a
different product. This change does not alter it.

OpenAI's auth doc says anonymous read-only mode is valid. OAuth prefers Client
ID Metadata Documents. Dynamic client registration runs only when the
authorization server advertises `registration_endpoint`. ChatGPT skips
registration when a Client ID Metadata Document is used. Jovie does not
advertise that document today. A later authenticated owner app would need that
document, or the existing registration flag, plus a reviewer account with no
multi-factor step. That is a different submission.

## Flag and endpoint

`CHATGPT_APP_DIRECTORY_MCP` defaults to false in `apps/web/lib/flags/code-flags.ts`.
`FEATURE_CHATGPT_APP_DIRECTORY_MCP=true` turns the route on. Any other value,
including an unset variable, leaves it off.

`SMART_LINK_MVP` also defaults to false. Only when
`FEATURE_SMART_LINK_MVP=true` does the directory list `make_link`; the website,
API, and `/l/{code}` pages share that flag.

While off, `POST`, `GET`, and `DELETE` return 404 with `Cache-Control: no-store`
and do not query profiles. While on:

- Missing `Origin` is allowed for server-to-server calls.
- The Jovie app origin is allowed.
- `https://chatgpt.com`, `https://chat.openai.com`, and `https://*.chatgpt.com` are allowed.
- Userinfo in the origin, plain `http` ChatGPT origins, and lookalike hosts are rejected with 403.
- The existing Redis public-artist limiter applies. Exhaustion is 429. An unavailable limiter is 503 with `Retry-After: 60`.
- Bodies over 16 KiB are rejected.
- Public rows must have `isPublic === true` and pass the public-profile discovery check that drops QA and reserved handles. A public artist whose display name matches their handle stays findable.
- Owner email, claim token, payment account, user id, internal profile id, latitude, and longitude are not selected into tool results.
- Listening and ticket links must be `http` or `https` with no userinfo. `javascript:` links become null.
- Profile text is data, not instructions.

`subscribe_to_updates` does not call `/api/notifications/subscribe`. That API
collects an email and a confirmation code. OpenAI forbids collecting
credentials or one-time codes through a tool.

## Annotations

The four directory reads publish:

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

`openWorldHint` is false because the tools read Jovie's public catalog. They
return public Spotify, Apple Music, YouTube, and ticket URLs, but they do not
fetch the open web. If an automated scan disagrees, appeal with that
explanation. Do not flip the hint to true just to clear the scan unless the
tool actually starts fetching those URLs.

`make_link` publishes `readOnlyHint: false`, `destructiveHint: false`,
`idempotentHint: false`, and `openWorldHint: true`. It writes a public page and
may call public music providers. Repeated stable recording identities reuse an
existing link, but unkeyed provider results are not promised idempotent. The
tool returns no price or checkout link.

Descriptions say when to use each tool, what public fields come back, and what
the tool does not do. They do not compare Jovie with other products.

## Metadata already in the package

Limits below are from the submission page as retrieved 2026-10-02.

| Field | Value | Limit |
| --- | --- | --- |
| `name` | `jovie-artists` | lowercase, hyphen, 64 |
| `displayName` | `Jovie` | 30. Do not append "MCP" or "Plugin". |
| `shortDescription` | `Find creators and get updates` | 29 of 30 |
| `developerName` | `Jovie` | 80 |
| `category` | `Entertainment` | one allowed category |
| `websiteURL` | `https://jov.ie` | required HTTPS |
| `supportURL` | `https://jov.ie/support` | required HTTPS |
| `privacyPolicyURL` | `https://jov.ie/legal/privacy` | required HTTPS |
| `termsOfServiceURL` | `https://jov.ie/legal/terms` | required HTTPS |
| `defaultPrompt` | three prompts | at most 3, each at most 128, no @mentions |
| `brandColor` / `brandColorDark` | `#635aff` | contrast vs white is 4.73:1; vs `#212121` is 3.40:1; both meet the 2:1 bar |
| logo and composer icons | `./assets/*.svg` | square `viewBox` 360, at least 48, SVG |

No screenshots. Tools-only plugins should not submit screenshots. No
`demo_recording_url` in the ZIP; the dashboard field is required at submit and
omitting it from the ZIP keeps a dashboard value. No `publication.countries`,
so the package does not invent a market restriction. `commerce` is false and
is not a legal acceptance. The package has no onboarding skill, no widget, and
no `frameDomains`.

## Review criteria

From the plugin guidelines page:

- The plugin finds public artists, reads profiles and updates, and creates an unclaimed public music link when enabled.
- Tool names and descriptions match that purpose. They are not promotional and do not rank Jovie against other products.
- Tools are independently usable. Search does not require the other tools. Profile, updates, and subscribe require an exact handle, which search returns.
- Annotations are explicit booleans, not omitted.
- Inputs are minimal: a search string, or a username. There is no full chat transcript and no precise user location input.
- The privacy policy already states what Jovie collects, why, which processors it uses, how long data is kept, and how people can ask about it. Directory tools do not receive the ChatGPT user's email. The rate limiter may see the connector IP.
- The tools do not request payment card data, health data, government identifiers, credentials, or one-time codes.
- Commerce in this program is for physical goods. This plugin sells nothing and does not add merch checkout.
- The app is for a general audience, not children under 13. The privacy policy already says Jovie is not directed to children under 13.
- Support contact is `https://jov.ie/support` and `support@jov.ie`.
- Reviewer credentials are not required for `noauth`. Do not put `test_credentials` or `reviewer_instructions` in the ZIP. The submission page rejects those fields.
- Tools-only: if the portal still asks about iframe domains, state that there are none.

## What Tim does to submit

Do this from Tim's OpenAI account. Do not submit, pay, or change DNS from the
repository.

1. Leave the plugin unsubmitted until production answers MCP initialize. The route 404s while the flag is off, and the scan will fail.
2. Set `FEATURE_CHATGPT_APP_DIRECTORY_MCP=true` and `FEATURE_SMART_LINK_MVP=true` together on Production only after this source and migration deploy, then redeploy. Do not set `FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION`.
3. Confirm `https://jov.ie/api/chatgpt/mcp` in developer mode. Expect the four read tools plus `make_link`, the annotations above, and no owner fields.
4. In the OpenAI Platform, use the org and project that should own the plugin. Complete individual or business verification. The owner role includes Apps Management Write (`api.apps.write`).
5. From `apps/web/plugins/jovie-artists`, create a ZIP whose root contains `plugin.json`, `mcp.json`, `README.md`, and `assets/`. Upload it under Plugins. Do not put secrets in the ZIP.
6. Connect the MCP server with authentication None. Complete domain verification by setting `OPENAI_APPS_CHALLENGE` to the portal token. The challenge route serves it as `text/plain`; the repository never stores it.
7. Wait for the tool scan. Fix server findings in this flag-gated route and rescan. Appeal only when an annotation finding is wrong, using the `openWorldHint` note above.
8. Run the six positive and four negative cases in developer mode against production. Record a walkthrough and put that URL in Review details in the dashboard, not in git.
9. Leave reviewer credentials blank, or state that the app has no sign-in. Do not use a real user account. If the portal requires a login, this anonymous app is the wrong shape. Do not turn on dynamic client registration to satisfy that prompt.
10. Ask counsel whether the Feb 2026 privacy policy needs one sentence that ChatGPT can call these public artist tools. Do not invent that sentence in the repo.
11. Attest and submit for review. Only one review can be in progress. Track status by email. Publish only after approval, and only when the listing should be live.
12. After publish, hosted tool changes are picked up by the daily scan or a manual rescan. Metadata and icon changes need a new ZIP. Changing the MCP URL is not part of the update flow; contact OpenAI support before attempting that.

Merging this change does not make the listing live. The production flag stays
off until step 2.
