<!-- generated: version da6e5c1b311a, tools/list 3b449a88fcfe63cfd959490228de4b89cedfabede3ba1561c63ead05990ad371 -->

# Jovie in Grok

Find an artist and draft their Jovie page and release smart link. Nothing is published.

## Add the connector

1. Open grok.com/connectors.
2. Choose New Connector, then Custom.
3. Enter the server URL shown below.
4. Save. No sign-in or API key is needed.

Server URL: `https://jov.ie/api/mcp`

## Try it

- Find Radiohead on Spotify and set up a Jovie draft for them.
- Set up a release page and smart link for this single: https://open.spotify.com/track/25dMCbj0duxuvx5T8ClCp3
- Which of these artists named Nova is the right one? Show me the candidates.
- Resume the Jovie draft I started earlier for this artist.
- What is still missing before this release draft is ready to review?

## Tools

- `artist.search_or_import`: Resolve a public Spotify/Apple artist identity or return ranked name candidates. Select an exact ID before drafting. Returns a private, seven-day draft_token; retain it for workspace.create_draft. Creates no account and does not publish.
- `workspace.create_draft`: Create or resume an unpublished visibility draft using the exact artist_id and draft_token from artist.search_or_import. Retrying the same token resumes the same draft; a token for another artist is rejected. Returns claim_url: show it to the user so they can sign in on Jovie and claim the draft; the artist is matched to its Spotify identity and stays private until the user publishes. Never share draft_token. Never claims ownership, publishes or purchases.
- `release.prepare_launch`: Resolve public release facts and create or resume an unpublished artist, release-page, and smart-link draft. Requires the draft capability. Returns only unresolved questions plus claim_url; when next_action is send_user_claim_url, show claim_url to the user so they can claim it on Jovie, where it stays private until they publish. Never claims, publishes, or purchases.
- `claim_handle`: Check and reserve the draft artist’s jov.ie handle (the profile URL). Returns availability with numbered suggested alternatives when taken. High-reach artists are routed to the existing verification path. The reservation completes when the artist signs in through claim_url; nothing is public until they publish.
- `answer_onboarding_question`: Record one onboarding Mom Test answer on the draft: lastGrowthAttempt (the artist's most recent growth attempt and how it went) or promoSpend (what they pay each month to promote their music, one of none, under_50, 50_plus). The exact question wording ships in the Jovie skill. Ask in your own voice; never lead or ask willingness-to-pay.
- `get_qualification`: Run the shared onboarding qualification for the draft artist. Returns qualified or queued with a reason; queued carries the locked line "Your handle is reserved. You're on the waitlist."
- `build_profile`: Build the draft profile from the artist's public data, including the real catalog preview when available. Read-only preview for the artist; nothing is published.
- `publish_profile`: Publish step. Agents never publish: show claim_url so the artist signs in on Jovie and publishes from their dashboard. Returns claim_required until the draft is claimed.
- `share_profile`: Return the public jov.ie profile URL plus a factual share line for an already-public profile. Never shares a private or unpublished profile.
- `start_upgrade`: Return the existing Jovie checkout entry for the draft artist (claim/start). Plans and prices are shown on Jovie from offer truth; never state a price yourself.

## Jovie in the xAI API

Add this entry to the tools array of a Responses API request. The same entry is in xai-remote-mcp.json.

```json
{
  "type": "mcp",
  "server_url": "https://jov.ie/api/mcp",
  "server_label": "jovie"
}
```

## Privacy and support

- Privacy: https://jov.ie/legal/privacy
- Terms: https://jov.ie/legal/terms
- Support: https://jov.ie/support
