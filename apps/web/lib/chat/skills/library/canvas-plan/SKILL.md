---
name: canvas-plan
description: Plan a Spotify Canvas video for one release, with the motion style, Spotify's specs and the upload steps. Use when the artist wants a Canvas for a track or asks how to make one.
plan: pro
---

# Canvas plan

A Canvas is the short looping video Spotify plays behind a track. Jovie does not make the video in chat yet, so this plan tells the artist exactly what to make and how to upload it.

## Steps

1. Find the release they mean in your Discography Context. If it has no artwork, say so: they need artwork first.
2. If checkCanvasStatus is available, check whether a Canvas is already set.
3. Pick a motion style with them: ambient (subtle movement and color shifts, the default), zoom, pan, particles or morph. Describe in one or two lines what the loop shows, built from their album art without cropping it.
4. Give Spotify's specs: 9:16 portrait, at least 720 by 1280 (1080 by 1920 is best), 3 to 8 seconds that loop cleanly, MP4 with H.264 at 30fps, 10 MB at most.
5. Give the upload path: Spotify for Artists, Music, pick the track, Canvas.
6. Once they say it's uploaded, call markCanvasUploaded for that release.

## Never

- Never say a Canvas was generated, processed or uploaded unless a tool result shows it.
- Never put text, logos or a play button over the art, and never crop it.
- Never post or upload for the artist. They upload in Spotify for Artists.
