---
name: load-investors
description: |
  Load investor records (angels, VCs, funds, fundraising contacts) into the Jovie
  fundraising Airtable base. Use when the user pastes a list and asks to add them.
  Upserts by LinkedIn URL primary, Name fallback. Reads AIRTABLE_API_KEY from
  Doppler (jovie-web/dev). Handles plain CSV, fenced markdown CSV blocks, and
  plain markdown tables (with confirmation).
---

# /load-investors

Drop in any investor list (CSV, markdown table, fenced code blocks). Skill normalizes, previews, dry-runs, then live-loads to Airtable. Idempotent on re-run.

## Defaults

- **Base:** `appln0KH60XfDQc6N` (Jovie fundraising)
- **Table:** `tblnFs2ZBzqwa2uhP` (`Longlist` — raw research; promote to `Contacts` table when engagement begins)
- **URL:** https://airtable.com/appln0KH60XfDQc6N/tblnFs2ZBzqwa2uhP
- **Loader:** `scripts/load-airtable-investors.ts`
- **Dedupe:** Pass A merges by LinkedIn URL (when present), Pass B merges by Name (fallback for empty-LinkedIn rows).

## Canonical 16-column schema

The loader expects exactly these column names, in this order:

```
ID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links
```

`Confidence` is a singleSelect: `High` / `Medium` / `Low`. Other values warn and clear.

## Workflow

### Step 0 — Preflight (always run first)

Verify Doppler has the PAT before doing anything else.

```bash
doppler secrets get AIRTABLE_API_KEY --project jovie-web --config dev --plain >/dev/null 2>&1
```

If it exits non-zero, stop and tell the user:

> **Setup required (one-time):**
>
> 1. Create a PAT at https://airtable.com/create/tokens
>    - Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
>    - Access: base `appln0KH60XfDQc6N`
> 2. Save it: `doppler secrets set AIRTABLE_API_KEY=<token> --project jovie-web --config dev`
>
> Then re-run /load-investors.

### Step 1 — Identify the source

Three input shapes:

| Shape | What to do |
|-------|-----------|
| User pasted text in the prompt | Save to `.context/load-investors-input-<timestamp>.txt`, use that path. |
| User attached a file (`/tmp/attachments/…`) | Use the path directly. |
| User said "the file at X" | Use that path. |

### Step 2 — Detect format and normalize

| Format | Action |
|--------|--------|
| Already canonical CSV (header matches) | Save to `.context/load-investors-<timestamp>.csv`. |
| Markdown with fenced ` ```csv ` blocks | Loader handles natively. Pass the raw `.txt`/`.md`. |
| Plain markdown table | Use `AskUserQuestion` to confirm column mapping, transform inline, save normalized `.csv`. |
| Ambiguous | Ask. Don't guess. |

#### Worked example: markdown table → canonical CSV

Input the user pasted:

```markdown
| Name        | Firm     | Stage    | Check  | Email          | LinkedIn                    | Notes        |
|-------------|----------|----------|--------|----------------|-----------------------------|--------------|
| Ada Lovelace| Babbage  | Pre-seed | $25k   | ada@bab.co     | linkedin.com/in/ada         | Met at SF24  |
| Alan Turing | Bletchley| Seed     | $100k  | alan@bp.co     |                             | Strong fit   |
```

Map to canonical CSV (leave unknown fields blank):

```csv
ID,Name,Title,Firm/Network,Location,Investment Stage,Typical Check Size,Sectors/Thesis,Notable Investments,Contact Email (or preferred contact method),LinkedIn,Twitter,AngelList/Crunchbase profile,Notes on qualification,Confidence,Source Links
1,Ada Lovelace,,Babbage,,Pre-seed,$25k,,,ada@bab.co,linkedin.com/in/ada,,,Met at SF24,,
2,Alan Turing,,Bletchley,,Seed,$100k,,,alan@bp.co,,,,Strong fit,,
```

Rules:
- Map `Firm` → `Firm/Network`, `Stage` → `Investment Stage`, `Check` → `Typical Check Size`, `Email` → `Contact Email (or preferred contact method)`, `Notes` → `Notes on qualification`.
- If the table has a `Confidence` column with `High`/`Medium`/`Low` values, pass through. Otherwise leave blank.
- Quote any field containing a comma.

### Step 3 — Preview

Always print the first 3 normalized rows to the user before running the loader. This catches mapping mistakes before they hit the API.

### Step 4 — Schema diff (`--dry-run`)

```bash
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/load-airtable-investors.ts --dry-run --source <path>
```

If the diff shows missing columns, tell the user which to add via the Airtable UI. **Do not attempt schema mutations.**

If the diff is clean, proceed.

### Step 5 — Live load

```bash
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/load-airtable-investors.ts \
  --source <path> --batch-id <slug>
```

Pick a meaningful `--batch-id` (e.g. the date or a phrase from the user's prompt) so the audit log filename is traceable.

### Step 6 — Report

Print the summary plus the table URL:

```
created:  N
updated:  M
failed:   K
audit:    .context/airtable-load-result-<batch>.json
airtable: https://airtable.com/appln0KH60XfDQc6N/tblnFs2ZBzqwa2uhP
```

If any failed, list the failed Names and surface the exact re-run command. Re-runs are idempotent — same source, same `--batch-id-retry`.

## What this skill does NOT do

- Schema mutations (no field creation).
- Loading into other Airtable bases — for those, run the script directly with `--base <id> --table <id>`.
- Contact enrichment, intro routing, outreach.

## Common failures

| Symptom | Fix |
|---------|-----|
| `AIRTABLE_API_KEY not set` | Doppler PAT missing — see Step 0. |
| `schema mismatch` | Add missing column in Airtable UI, or pass `--force` to skip. |
| `unknown singleSelect values` | Normalize values in source, or accept `typecast: true` (default) to auto-create. |
| `429 rate-limited` | Loader auto-retries; if persistent, re-run with same `--batch-id`. |
| Mid-run 401/403 | PAT rotated/expired — fix in Doppler, re-run (idempotent via upsert). |
