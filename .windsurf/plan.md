# Plan
Plan: Linktree ingest should use profile avatar (not og/share image) and correct profile name
1) Parse Linktree __NEXT_DATA__ for avatar/profile name fields and prefer them over og meta; avoid “Links” titles.
2) Wire ingestion to store hosted avatar via copy-to-blob, using the parsed profile avatar URL (fallback if missing).
3) Re-run admin ingest for failing examples (Pharrell, Selena Gomez) to confirm correct avatar/name and no Next/Image host issues.
