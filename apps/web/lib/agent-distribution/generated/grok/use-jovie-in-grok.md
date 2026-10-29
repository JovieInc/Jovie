<!-- generated: version f762d704e4a8, tools/list 87e4a522b0ed1415e0ca53e123958ef35b15b35f4eeff2fe72cc35d3cafe32f6 -->

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
