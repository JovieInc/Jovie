# apps/macos

This is where native Mac surfaces live, and they are SwiftUI by default (see the root AGENTS.md "Mac app platform" section). Use AppKit only through SwiftUI bridges when SwiftUI has no equivalent.

- Follow the Noir Ion tokens and the front-end skill: text is 12pt or larger, colors come from the shared tokens and are never ad-hoc, and every control has a visible focus state.
- New Mac features go here rather than in `apps/desktop`.
