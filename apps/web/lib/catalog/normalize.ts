const COLLABORATOR_ALIAS_PUNCTUATION = /[.,'"!?]/g;
const COLLABORATOR_ALIAS_CONJUNCTION = /\s*&\s*/g;
const COLLABORATOR_ALIAS_MULTI_SPACE = /\s+/g;

/**
 * Normalizes collaborator aliases for deterministic catalog matching.
 * Lowercases, collapses whitespace, normalizes "&" to "and", and strips punctuation.
 */
export function normalizeCollaboratorAlias(value: string): string {
  return value
    .trim()
    .replace(COLLABORATOR_ALIAS_CONJUNCTION, ' and ')
    .replace(COLLABORATOR_ALIAS_PUNCTUATION, '')
    .replace(COLLABORATOR_ALIAS_MULTI_SPACE, ' ')
    .toLowerCase();
}

export function tokenizeCollaboratorAlias(value: string): readonly string[] {
  return normalizeCollaboratorAlias(value).split(' ').filter(Boolean);
}

export function collaboratorAliasSimilarity(
  left: string,
  right: string
): number {
  const leftTokens = new Set(tokenizeCollaboratorAlias(left));
  const rightTokens = new Set(tokenizeCollaboratorAlias(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}
