# Chat Audit

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Scope

This audit tracks streaming, message rendering, markdown rendering, tool
invocation rendering, retry behavior, error recovery, context persistence,
scroll behavior, message ordering, optimistic updates, and reconnection
behavior across Web, iOS, Electron, and Chrome Extension.

## Current Evidence

| Platform | Evidence | Result |
| --- | --- | --- |
| iOS | `pnpm run ios:screenshots` passed on `origin/main` `9e9200348e` and produced `artifacts/ios-screenshots/06-chat.png`. The screenshot rendered the chat shell, empty state, input, and controls without obvious clipping or blank content. `bash apps/ios/scripts/run-xcodebuild.sh test -only-testing:JovieUITests/JovieUITests/testChatComposerPreservesDraftAcrossShellNavigation` passed on `codex/ios-chat-draft-hardening` after `86ba0c65f9`, verifying one composer input and preserving a typed draft through Chat to Profile to Chat shell navigation. | Visual smoke and draft stability passed |
| Web | Evidence required under JOV-2712. | Open |
| Electron | Evidence required under JOV-2712. | Open |
| Chrome Extension | Evidence required under JOV-2712. | Open |

## Acceptance Checks

| Check | Status |
| --- | --- |
| Stable streaming | Evidence required under JOV-2712 |
| Smooth scrolling | Evidence required under JOV-2712 |
| No lost conversations | iOS composer draft persistence passed for shell navigation; message persistence evidence required under JOV-2712 |
| No duplicate messages | iOS composer uniqueness passed for shell navigation; streaming duplicate-message evidence required under JOV-2712 |
| Consistent platform behavior | Evidence required under JOV-2712 |
