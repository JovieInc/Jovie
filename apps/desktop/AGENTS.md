# apps/desktop (Electron)

This app is maintenance-only. Mac app work defaults to SwiftUI in `apps/macos` (see the root AGENTS.md "Mac app platform" section).

- Fix bugs and keep it secure here, but don't add new surfaces, windows, or menu-bar items.
- When a surface needs real work, move it to SwiftUI in `apps/macos` instead of expanding Electron.
- Tim must explicitly approve any exception.
- Ultrawide full screen comes first: production runs full screen on an ultrawide monitor (Ovie, where Tim's attention items land). Design and test there first, and treat the IA of that surface as ongoing work.
