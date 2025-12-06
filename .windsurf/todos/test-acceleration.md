---
description: speed up slow tests over 200ms
---
## Goal
Bring slow-running test suites under ~200ms by eliminating unnecessary delays and heavy async flows.

## Tasks
1. Tooltip tests
   - Use fake timers to skip delayDuration/skipDelayDuration waits.
   - Reduce userEvent setup where fireEvent suffices.
   - Ensure all findBy*/hover flows advance timers instead of real time.
2. AvatarUploadable tests
   - Avoid repeated renders/loops; minimize async waitFor usage.
   - Stub upload/resets with deterministic promises; consider fake timers for status resets.
3. Verify
   - Rerun affected suites or entire unit suite to confirm timings drop <200ms and all pass.

## Definition of Done
- All previously slow suites consistently execute <200ms locally.
- No skipped assertions; behaviors still validated.
- Tests remain deterministic with fake timers correctly restored.
