# Authoring Help Center guides

Status: canonical authoring contract
Owner: JOV-5898
Implementation: `apps/docs/components/help/`, `apps/docs/lib/article-structure.mjs`
Metadata contract: [ARTICLE_METADATA.md](ARTICLE_METADATA.md)
Worked examples: `apps/docs/app/docs/self-serve-guide/add-a-release-manually/page.mdx` (task guide), `apps/docs/app/docs/developers/help-article-primitives/page.mdx` (technical reference)

Every task guide uses one canonical anatomy. The build enforces the order; do
not hand-arrange sections or add layout CSS.

## Canonical task-guide anatomy

1. `<HelpArticle id="…">` wrapping the whole body; the `id` must match the
   frontmatter `id`.
2. `# Title` describing customer intent (`Connect Spotify to Jovie`, not
   internal system nouns).
3. `<HelpOutcome>` — one sentence on what the reader will accomplish.
4. `<HelpPrerequisites>` — optional; only prerequisites that actually block
   the task.
5. `<HelpSteps>` with three to seven `<HelpStep title="…">` entries using
   exact interface labels and route names.
6. At least one `<HelpScreenshot>` or `<HelpVideo>` adjacent to the step it
   proves, with `alt` text that describes the proof.
7. `## What happens next` — how the reader knows it worked and the next
   useful action.
8. `<HelpTroubleshooting>` — optional; two or three likely failure cases as
   `###` symptom headings each followed by concrete recovery.
9. `<HelpRelatedGuides>` — at most three; pass `ids={[...]}` to choose
   explicitly.
10. `<HelpContactPanel>` — optional escalation; defaults to the canonical
    `/support` surface.
11. `<HelpFeedback articleId="…">` last, then `</HelpArticle>`.

## Editorial rules

- Lead with the action, not product history.
- Use exact interface labels and route names; register them in `uiLabels`.
- Avoid giant paragraphs, repeated caveats, generic FAQs, and marketing copy.
- `alt` text is required on every screenshot or clip; the build fails without
  it.
- `HelpCallout type="warning"` only for real risk or irreversible behavior.
- Reference and landing documents share these primitives and typography but
  are free-form; the anatomy above applies to `documentType: guide`.

## Hooks and certification

`HelpArticle` emits `data-article-id`, `data-document-type`, `data-category`,
and `data-status`; `HelpScreenshot`/`HelpVideo` emit `data-help-proof`;
`HelpFeedback` dispatches a `jovie:help-feedback` CustomEvent with
`{ articleId, value }`. Analytics, search, and screenshot certification bind
to these hooks rather than page-specific markup.
