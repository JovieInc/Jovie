/**
 * The registered domain functions: the only way an agent tool or a form may
 * change a product record. One function per write, shared by every entry point,
 * so the same request always saves the same state. Add a function here (and
 * move the form and the chat tool onto it) before an agent can do something a
 * form can.
 */
export const DOMAIN_FUNCTIONS = {
  createReleaseForProfile: '@/lib/domain/releases',
  applyProfileUpdate: '@/lib/domain/profile',
} as const;
