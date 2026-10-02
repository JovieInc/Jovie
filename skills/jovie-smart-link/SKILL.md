---
name: jovie-smart-link
description: Make one Jovie link for a song or artist so it opens on streaming services. Use when someone asks to make or create a smart link, one link for a song, or a link to all streaming services.
---

# Make a Jovie link

One input becomes one public Jovie link. The link stays unclaimed until the artist opens `claimUrl`. Opening that page does not create an account and does not prove ownership.

## Preferred command

The published pin `@jovie/cli@26.9.16` does not include `link create`. Until an operator publishes a release that includes the command, use the curl fallback. That pin is the working public install, and it cannot run this command.

When the installed CLI includes `link create`:

```sh
npx -y @jovie/cli link create "<query>" --json
```

`<query>` is a streaming URL, an ISRC, or text such as `Artist - Track`.

## Fallback

Use this when the CLI lacks `link create`, Node is not 24, or npx is unavailable:

```sh
curl -sS -X POST https://jov.ie/api/links \
  -H 'content-type: application/json' \
  -d '{"query":"<query>"}'
```

## How to answer

- `created` or `existing`: give the person `shortUrl`. A repeat of the same query returns the existing link.
- `needs_choice`: ask the person to pick one candidate, then call again with that candidate's URL. Do not pick a same-name artist yourself.
- `RATE_LIMITED`, `LIMIT_REACHED`, and `FEATURE_DISABLED`: say that plainly. Do not quote a price or start a purchase. `LIMIT_REACHED` may include `plansUrl`.
- The link is unclaimed. If the person is the artist and has a Spotify artist URL, you may offer `jovie profile create <url>` and give `claimUrl` only to that artist.

Do not send secrets. The CLI sends no telemetry beyond its User-Agent.

## Install

```sh
npx skills add JovieInc/Jovie --skill jovie-smart-link
```

The skill also lives at `https://github.com/JovieInc/Jovie/tree/main/skills/jovie-smart-link`.

`npx skills add ./ --list` prints every skill in this repository. Pass `--skill jovie-smart-link` when installing so only this skill is selected. `npx skills add ./skills/jovie-smart-link --list` shows this skill alone.
