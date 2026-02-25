# Docs site approach decision (JOV-963)

## Decision

Use **Nextra 4** in a dedicated `apps/docs` Next.js app for the initial documentation platform scaffold.

## Why Nextra 4

- Native Next.js fit in our existing Turborepo architecture.
- MDX-first authoring with lightweight setup overhead.
- Easy static hosting path and incremental docs evolution.
- Strong alignment with current frontend stack and design token reuse.

## Alternatives considered

### Docusaurus

Pros:
- Mature docs ecosystem and plugin catalog.

Cons:
- Separate React build/runtime conventions from our primary Next.js stack.
- Higher integration overhead for shared UI and styling primitives.

### Mintlify

Pros:
- Fast setup for public-facing docs.

Cons:
- External platform lock-in and lower control over custom product experiences.
- Less flexible for deep monorepo-integrated developer workflows.

## Initial scaffold scope

- Create `apps/docs` workspace app.
- Add baseline Nextra configuration and theme config.
- Ship a starter landing page and repository integration metadata.
- Defer content inventory migration until JOV-962 registry is complete.

## Follow-up work

- Build information architecture from feature registry outputs.
- Define docs navigation and content ownership model.
- Add analytics, search tuning, and quality checks for docs content.
