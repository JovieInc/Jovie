---
name: dsp-profile-image-sync
description: Sync an artist's approved Jovie profile image, bio, website, and Jovie bio link to connected music-platform artist profiles and social accounts; and pull authorized DSP or distributor metrics back into Jovie. Use when asked to update artist profile fields, image, photo, avatar, header image, bio, website, or bio link on Beatport Greenroom, Spotify for Artists, a distributor, a social network, or another DSP; or to connect streaming and royalty metrics for attribution.
---

# DSP artist sync

Use this skill to coordinate profile-field updates and authorized DSP/distributor metric imports. Do not treat a supplied value as authorization to publish it externally, or a DSP metric as attributable revenue without a documented attribution chain.

## Workflow

1. Identify the artist and source fields.
   - Offer **Use my current Jovie profile**, **Upload a new image**, or **Edit the text first**.
   - Resolve every selected field to a versioned source: image asset/version/checksum; approved bio revision; canonical website; canonical Jovie profile URL.
   - Do not overwrite Jovie's canonical profile fields from an external platform automatically.

2. Discover eligible destinations.
   - Show only connected, artist-authorized accounts.
   - For each destination, read its current image and validation requirements before proposing a write.
   - Mark unavailable capabilities honestly: disconnected, unsupported, needs human, or API/terms unknown.

3. Normalize and preview.
   - Generate a per-destination, non-destructive crop/resize preview for images.
   - Show exact before/after text for bios, websites, and bio-link placement; preserve length limits and platform-specific formatting.
   - Show each platform's requirement and whether each selected field passes.
   - Preserve the original upload; never silently crop the only source.

4. Require one explicit confirmation.
   - State the exact artist, field values, and each external platform that will change.
   - Do not submit an external write until the artist confirms that destination set.

5. Apply independently and report truthfully.
   - Execute each connector independently so one failure does not hide the others.
   - Return platform, target artist, prior image reference when available, result, retryability, and receipt/remote URL.
   - Persist audit data: actor, selected asset version/checksum, confirmation time, connector response, and rollback reference when the destination supports it.

## Connector rules

## Metrics and attribution loop

1. Connect only accounts the artist is authorized to access and record the precise artist/catalog scope.
2. Pull immutable or versioned source observations: date range, metric definition, currency, territory, DSP/distributor account, release/ISRC, and retrieval time.
3. Separate **observed revenue** (for example, distributor royalty statements) from **estimated revenue** and **Jovie-attributed revenue**.
   - Never infer DSP royalties from stream counts alone.
   - Never credit Jovie with a revenue result without a supported chain such as Jovie link/campaign → destination/referrer → release/ISRC → platform or distributor outcome.
4. Use reconciled distributor statements as the source of truth for realized revenue; DSP engagement data is a leading indicator.
5. Preserve raw source references and normalization/version metadata so reports can be recomputed as delayed royalty data arrives.
6. Present confidence and latency plainly: real-time clicks, delayed DSP engagement, and delayed distributor royalties are different measurement layers.

The resulting loop is: Jovie action → fan/link events → DSP engagement → distributor/commerce revenue → next-best action. Do not collapse those layers into one invented ROI figure.

### Beatport Greenroom

- Use the artist Profile route and its **Change Profile Image** flow.
- Current observed requirement: artist image must be at least **590×404**.
- The upload dialog requires choosing a file and an explicit Upload action.
- Treat the portal flow as a human-authorized capability proof. Production automation needs an approved API/partner connector or an explicit human-in-the-loop handoff; do not rely on brittle UI scraping for unattended writes.

### Spotify for Artists

- Require claimed Spotify for Artists access for the selected artist.
- Validate a high-resolution source and center-safe crop before proposing upload. Spotify's public guidance recommends at least **2660×1140** and under **20 MB**; verify current requirements during execution.
- Use an approved API/partner connector if available. Otherwise create a prepared handoff to Spotify for Artists; do not imply an unsupported API write succeeded.
- Import available audience and performance metrics only through an authorized, documented connector. Treat streaming data as engagement, not royalty revenue.

### Distributor

- Prioritize an approved distributor connector for catalog, ISRC, territory, statement, royalty, and payout data.
- Normalize money in original currency and preserve FX method/version for any rolled-up currency view.
- Reconcile late, adjusted, or reversed statements; never overwrite historical observations.

## Safety and UX

- Keep connector state explicit: `disconnected`, `ready`, `preview`, `confirmation-required`, `applying`, `succeeded`, `failed`, `needs-human`.
- Put global connector/auth failures inline in the platform result region, not in the chat composer.
- Use the overlay governor: a confirmation sheet suppresses unrelated QR prompts, banners, and utilities.
- Never log image bytes, OAuth tokens, or credentials in chat or PR artifacts.
- Jovie's bio link is opt-in per destination. Never replace an existing website/bio link without showing it, preserving any required existing link, and receiving explicit consent for that exact platform.

## Evidence before shipping

- Use a representative artist and real image fixture.
- Test current-Jovie-image and new-upload paths; no-selection, unsupported image, disconnected account, user cancellation, partial failure, retry, and rollback where supported.
- Attach desktop/mobile screenshots of source, target chooser, preview, confirmation, progress, and result states to the PR.
- Attach a short screen recording for the confirmation-to-result interaction.
