---
title: "Short canonical title (≤ 60 chars)"
claim: "One-sentence canonical claim describing what this doc teaches. Used in source chips and embedded for retrieval. Be specific."
tags: [release, distribution]
source_url: "https://example.com/optional-public-source"
---

# Short H1 (the title can repeat or expand)

First paragraph is the embedding source — write tightly. The retrieval
layer scores user queries against the body of this doc using cosine
similarity, with a tag-boost on top.

## Section headings are fine

Keep docs ~600–1,500 words. Multiple sections OK. Code blocks and lists
render through the model as plain text — be cautious with markdown
formatting that might confuse the assistant.

## Authoring rules

- `tags` must come from the closed set in `apps/web/lib/chat/knowledge/canon-loader.ts`.
  Adding a new tag is a code change; PR reviewers will flag it.
- `claim` is what users see in the source chip on chat answers. Make it scan
  in under 5 seconds.
- `source_url` is optional. If present, the chip becomes clickable and opens
  the URL in a new tab. Internal-only references (no public URL) leave it off.
- `version` is intentionally NOT a frontmatter field. Git history + the file's
  sha256 already version this doc; adding a `version: 2` would be cargo-cult.

## When NOT to add a canon doc

- Anything specific to a single artist's catalog → use an artist-data tool
  (`lookupRecentReleases`, `lookupCatalogHealth`, etc.) instead.
- Anything ChatGPT/Claude already knows well from public training data and
  doesn't need Jovie-specific framing → skip; let the model answer from
  general knowledge.
- Anything that's actually a workflow, not a fact → put it in the chat
  system prompt or a tool description, not canon.

The canon is for **non-obvious music-industry facts and Jovie-specific framing**
that materially improve answer quality and that we want every Jovie chat
response to be able to cite.
