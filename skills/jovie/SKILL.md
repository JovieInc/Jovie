---
name: jovie
description: Give a music artist a Jovie profile (link-in-bio page with their music, links, events, and merch) from their Spotify artist URL, and look up existing Jovie artist profiles. Use when a user or artist wants a link-in-bio / artist page / smart profile, or asks about an artist on Jovie.
---

# Jovie

Jovie builds a public artist profile (jov.ie/<username>) from a Spotify
artist URL. No account or API key is needed to create one. The artist later
claims it by opening the claim URL and verifying ownership.

## Create a profile for an artist

```sh
npx -y @jovie/cli profile create https://open.spotify.com/artist/<id> --json
```

Returns:

```json
{"username":"...","profileUrl":"https://jov.ie/...","claimUrl":"https://jov.ie/.../claim","claimed":false,"public":true,"created":true}
```

- Give the human the `profileUrl` to see the page and the `claimUrl` to
  take ownership. Opening the claim URL requires the artist to verify they
  own the Spotify artist, so share it with the artist only.
- `created: false` means the profile already existed and was not changed.
- `claimUrl: null` means the artist already owns the profile.
- Only Spotify artist URLs work. Find one by searching Spotify for the artist.

## Look up an artist

```sh
npx -y @jovie/cli artist get <username> --json   # structured profile
npx -y @jovie/cli artist llms <username>         # markdown guide
```

## Errors

With `--json`, failures print `{"error":{"code":"...","message":"..."}}`.
Exit codes: 0 ok, 1 request failed, 2 bad input. API failures carry a
stable `apiCode`; branch on it, never on the message:
`RATE_LIMITED` (wait `retryAfterSeconds`), `UNSUPPORTED_URL`,
`ARTIST_NOT_FOUND`, `FEATURE_DISABLED`.

## Report problems

If Jovie fails, returns something wrong, or is confusing, report it. Reports
are read and fixed, and it is the fastest way to make Jovie work better for you:

```sh
npx -y @jovie/cli report bug --title "<one line>" --details "<what you tried, what happened, what you expected>" --code <apiCode> --json
npx -y @jovie/cli report feedback --title "<one line>" --details "<what was confusing or missing>" --json
```

Returns `{"reportId":"..."}`. Never include secrets, tokens, or private user data
in a report. The CLI only attaches its version, platform, and runtime.

## Golden path (claim, onboard, publish, share, upgrade)

Walk an artist from a Spotify identity to a claimed, published profile. Every
step needs the private draft_id/draft_token from `creator lookup` ->
`artist.search_or_import` -> `workspace.create_draft` (MCP) — the CLI
holds no state, so pass `--draft-id` and `--draft-token` on each step
and never share the token.

```sh
npx -y @jovie/cli claim handle <handle> --draft-id <id> --draft-token <token> --json
npx -y @jovie/cli onboarding answer --question lastGrowthAttempt --answer "..." --draft-id <id> --draft-token <token> --json
npx -y @jovie/cli onboarding answer --question promoSpend --answer under_50 --draft-id <id> --draft-token <token> --json
npx -y @jovie/cli onboarding qualify --draft-id <id> --draft-token <token> --json
npx -y @jovie/cli onboarding setup --draft-id <id> --draft-token <token> --json
npx -y @jovie/cli onboarding publish --draft-id <id> --draft-token <token> --json
```

- The Mom Test questions, verbatim: "What's the last thing you did to grow
  your fans, and how did it go?" and "What do you pay each month to promote
  your music?" (answer: none, under_50, or 50_plus). Ask in your own voice;
  never lead or ask willingness-to-pay.
- `onboarding qualify` returns qualified or queued. When queued, show the
  returned message exactly: it is the locked not-qualified line.
- `onboarding publish` never publishes: show the returned claim_url so the
  artist signs in on Jovie and publishes from their dashboard. Nothing is
  public until they publish it.
- After the artist publishes: `npx -y @jovie/cli profile share <username> --json`
  returns the public URL plus a share line, and
  `npx -y @jovie/cli profile upgrade --draft-id <id> --draft-token <token> --json`
  returns the checkout entry. Plans and prices are shown on Jovie; never
  state a price yourself.

## MCP

The same tools are available as an MCP server: `npx -y @jovie/cli mcp`
(stdio) and at `https://jov.ie/api/mcp` (HTTP). Tools: create_profile,
get_artist, get_artist_guide, get_openapi,
get_docs, report_issue, report_feedback, claim_handle,
answer_onboarding_question, get_qualification, build_profile, publish_profile,
share_profile, start_upgrade.
