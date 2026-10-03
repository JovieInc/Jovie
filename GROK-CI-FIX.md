CI-fix only on existing PR https://github.com/JovieInc/Jovie/pull/16435

You are the admitted Rush CI-fix agent. Not a product writer. Not a second PR.

WORKTREE (already checked out):
/Users/timwhite/worktrees/jov-5319-16435-ci-fix
branch: fallback/JOV-5319-fix
HEAD: 9d925c7b38d0ec78a41fa6e1eb6465e91697bb4b

REQUIRED CHANGE (only this):
In apps/ios/JovieTests/AppShellChatFirstTests.swift add `import Foundation` as the first import so UserDefaults compiles.

Keep:
  import Foundation
  import Testing
  @testable import Jovie

Do not rewrite greeting tests. Do not touch product UI. Do not open a second PR. Do not touch #16436. Do not remount / enqueue native MQ. Do not merge. Do not create kimi/ or cursor/ branches. Do not rebase.

Prior grok applied the edit then the worktree was deleted before commit/push. Remote still lacks the import. Line 132 still uses UserDefaults.

THEN:
1. git add that one file
2. commit: fix(ios): import Foundation in AppShellChatFirstTests (JOV-5319)
3. git push origin fallback/JOV-5319-fix
4. Stop. Print the new SHA and PR URL.

Evidence of fail: merge_group run https://github.com/JovieInc/Jovie/actions/runs/32642164566
`AppShellChatFirstTests.swift:132:20 cannot find 'UserDefaults' in scope`
MQ ejected 16435 at 2026-08-23T13:35:29Z. Do not requeue until this push exists.
