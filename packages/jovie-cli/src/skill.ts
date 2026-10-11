/** The agent skill shipped by `jovie skill` and installed by `jovie init`. */
export const SKILL_MD = `---
name: jovie
description: Extract public creator fields from supported social URLs, give a music artist a Jovie profile from Spotify, and look up existing Jovie artist profiles.
---

# Jovie

Jovie builds a public artist profile (jov.ie/<username>) from a Spotify
artist URL. No account or API key is needed to create one. The artist later
claims it by opening the claim URL and verifying ownership.

## Look up a creator without creating a profile

\`\`\`sh
npx -y @jovie/cli creator lookup https://www.youtube.com/@creator --json
npx -y @jovie/cli creator lookup youtube:@creator --json   # platform:handle works too
\`\`\`

Accepts a creator profile URL or \`platform:handle\` (youtube, instagram,
tiktok, linktree). When Jovie already has a public profile for that channel,
the result is \`{"exists":true,"username":...,"profileUrl":...}\` and no source
page is fetched. Otherwise it is \`{"exists":false,"displayName":...,"bio":...,"avatarUrl":...,"links":[...]}\`
extracted from the source. Instagram, TikTok, and Linktree sources fail with
\`SOURCE_UNSUPPORTED\` because Jovie does not read those pages from its servers;
ask for the creator's YouTube channel instead. This command is read-only and
never creates a Jovie profile.

## Create a profile for an artist

\`\`\`sh
npx -y @jovie/cli profile create https://open.spotify.com/artist/<id> --json
\`\`\`

Returns:

\`\`\`json
{"username":"...","profileUrl":"https://jov.ie/...","claimUrl":"https://jov.ie/.../claim","claimed":false,"public":true,"created":true}
\`\`\`

- Give the human the \`profileUrl\` to see the page and the \`claimUrl\` to
  take ownership. Opening the claim URL requires the artist to verify they
  own the Spotify artist, so share it with the artist only.
- \`created: false\` means the profile already existed and was not changed.
- \`claimUrl: null\` means the artist already owns the profile.
- Only Spotify artist URLs work. Find one by searching Spotify for the artist.

## Look up an artist

\`\`\`sh
npx -y @jovie/cli artist get <username> --json   # structured profile
npx -y @jovie/cli artist llms <username>         # markdown guide
\`\`\`

## Errors

With \`--json\`, failures print \`{"error":{"code":"...","message":"..."}}\`.
Exit codes: 0 ok, 1 request failed, 2 bad input. API failures carry a
stable \`apiCode\`; branch on it, never on the message:
\`RATE_LIMITED\` (wait \`retryAfterSeconds\`), \`UNSUPPORTED_URL\`,
\`ARTIST_NOT_FOUND\`, \`FEATURE_DISABLED\`.

## Report problems

If Jovie fails, returns something wrong, or is confusing, report it. Reports
are read and fixed, and it is the fastest way to make Jovie work better for you:

\`\`\`sh
npx -y @jovie/cli report bug --title "<one line>" --details "<what you tried, what happened, what you expected>" --code <apiCode> --json
npx -y @jovie/cli report feedback --title "<one line>" --details "<what was confusing or missing>" --json
\`\`\`

Returns \`{"reportId":"..."}\`. Never include secrets, tokens, or private user data
in a report. The CLI only attaches its version, platform, and runtime.

## MCP

The same tools are available as an MCP server: \`npx -y @jovie/cli mcp\`
(stdio). Tools: lookup_creator, create_profile, get_artist, get_artist_guide, get_openapi,
get_docs, report_issue, report_feedback.
`;
