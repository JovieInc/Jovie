# apps/macos

This is where native Mac surfaces live, and they are SwiftUI by default (see `.claude/rules/macos.md`). Use AppKit only through SwiftUI bridges when SwiftUI has no equivalent.

- Follow the Noir Ion tokens and the front-end skill: text is 12pt or larger, colors come from the shared tokens and are never ad-hoc, and every control has a visible focus state.
- New Mac features go here rather than in `apps/desktop`.
- Ultrawide full screen comes first: production runs full screen on an ultrawide monitor (Ovie, where Tim's attention items land). Design and test there first, and treat the IA of that surface as ongoing work.
- The Ovie surface is covered by a perpetual design loop on gem (deterministic schedule with a dead-man check). Findings feed `pipeline-bottleneck/v1`, and design debt goes to Linear. See `.claude/rules/macos.md`.
