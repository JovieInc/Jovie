export const TEST_MODE_HEADER = 'x-test-mode';
export const TEST_USER_ID_HEADER = 'x-test-user-id';
export const TEST_AUTH_BYPASS_MODE = 'bypass-auth';
export const TEST_MODE_COOKIE = '__e2e_test_mode';
export const TEST_USER_ID_COOKIE = '__e2e_test_user_id';
export const TEST_PERSONA_COOKIE = '__e2e_test_persona';

// Precomputed by getDeterministicDevTestAuthPersonaUserId('creator'). Keep the
// browser-reachable test-mode module free of Node's crypto implementation.
export const DEFAULT_TEST_CREATOR_USER_ID =
  '02fbb6ae-fae2-89bb-a4b2-d18ec56ee2ff';
