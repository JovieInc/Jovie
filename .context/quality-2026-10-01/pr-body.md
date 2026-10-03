Audience status badges inherited a 32px line height and became 36px tall inside a 32px table cell. Creator identity content similarly expanded to 72px, cutting through avatars and hiding username actions.

This keeps the shared cell height stable while centering normal-height content. Creator names use two compact text lines, with canonical compact actions beside the identity. Action spacing preserves separate hit targets and room for keyboard focus rings.

Refs JOV-7434.
<!-- linear-issue-id:7cb8594d-4c45-450d-bcab-de31e68aa3c0 -->

## Validation

- Production defect reproduced on Audience and Ovie People/Creators; screenshots retained in the local quality evidence folder.
- Regression test: `apps/web/tests/e2e/storybook-task-row-geometry.spec.ts`. Original badge code fails by exactly 4px at 1280px and 390px. The existing CI selector runs the same geometry spec for TableCell changes. It also checks real creator-cell rendering, all clipping ancestors, focus clearance, action hit ownership, long labels, both themes, and existing multiline task rows.
- Final head `7da7799275cf044732c6d210798be7a7bc3ac5ff`: 17 focused Vitest tests and all 11 browser cases passed on the existing Air host. The creator fixture explicitly constrains the table to 320px and keeps the avatar visible when actions receive focus.
- Final qualification passed 17/17 typecheck tasks, 8/8 lint tasks, 37 affected tests, and the component gate.
- Original creator source also fails the avatar clipping regression. Final hosted exact-head coverage passed 1,406 tests with 16/19 changed lines covered (84.2%). Source Validation and PR Ready passed.
- Independent source review completed; focus-ring clipping and overlapping hit-target findings were fixed and added to the browser regression.

This is a bounded first repair in the existing quality workstream; no all-screen certification claim. Source qualification is complete. Native combined-head validation, deployment, and production before/after readback are separate delivery steps.
