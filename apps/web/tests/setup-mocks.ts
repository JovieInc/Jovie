/**
 * Legacy component-mock entrypoint.
 *
 * The old implementation defined `vi.mock()` inside a setup function, which
 * Vitest hoists anyway. That created global warning noise and polluted suites
 * that never intended to use these mocks. Keep this file as a compatibility
 * shim for any ad hoc imports while delegating the actual mocks to the
 * top-level-safe helpers in `tests/utils/lazy-mocks.ts`.
 */

import './utils/lazy-mocks';

export function setupComponentMocks() {}
