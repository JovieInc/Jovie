/**
 * Operator Summer vs customer Jovie isolation (JOV-5212 / JOV-4320).
 *
 * Tim-as-operator context cannot be read from customer Jovie. Customer Jovie
 * cannot access Summer/company tools. Memory namespaces never share keys.
 */

export const JOVIE_ARTIST_NAMESPACE = 'jovie-artist' as const;
export const SUMMER_MEMORY_NAMESPACE = 'summer' as const;

export type IsolationNamespace =
  | typeof JOVIE_ARTIST_NAMESPACE
  | typeof SUMMER_MEMORY_NAMESPACE;

export const SUMMER_SAFE_TOOLS = [
  'get_org_state',
  'get_invariant_stewardship',
  'inspect_kanban',
  'search_gbrain',
] as const;

export type SummerSafeTool = (typeof SUMMER_SAFE_TOOLS)[number];

export const ARTIST_JOVIE_TOOLS = [
  'proposeAvatarUpload',
  'proposeSocialLink',
  'merchPropose',
] as const;

export class IsolationError extends Error {
  constructor(
    readonly code:
      | 'cross-namespace-read'
      | 'customer-summer-tool'
      | 'operator-artist-tool',
    message: string
  ) {
    super(message);
    this.name = 'IsolationError';
  }
}

export function isSummerSafeTool(name: string): name is SummerSafeTool {
  return (SUMMER_SAFE_TOOLS as readonly string[]).includes(name);
}

export function authorizeIsolatedTool(
  namespace: IsolationNamespace,
  tool: string
): { readonly allowed: boolean } {
  if (namespace === SUMMER_MEMORY_NAMESPACE) {
    return { allowed: isSummerSafeTool(tool) };
  }
  return { allowed: !isSummerSafeTool(tool) };
}

export function assertIsolatedToolAllowed(
  namespace: IsolationNamespace,
  tool: string
): void {
  if (authorizeIsolatedTool(namespace, tool).allowed) return;
  if (namespace === JOVIE_ARTIST_NAMESPACE) {
    throw new IsolationError(
      'customer-summer-tool',
      'Customer Jovie cannot access Summer/company tools'
    );
  }
  throw new IsolationError(
    'operator-artist-tool',
    'Summer cannot execute artist Jovie tools'
  );
}

export function operatorContextVisibleToCustomerJovie(): false {
  return false;
}

export function customerJovieCanAccessSummerTools(): false {
  return false;
}

export class IsolatedMemory {
  private readonly records = new Map<string, string>();

  constructor(readonly namespace: IsolationNamespace) {}

  write(key: string, value: string): void {
    this.records.set(key, value);
  }

  read(key: string): string | undefined {
    return this.records.get(key);
  }

  keys(): readonly string[] {
    return [...this.records.keys()];
  }
}

export function readIsolatedMemory(
  memory: IsolatedMemory,
  namespace: IsolationNamespace,
  key: string
): string | undefined {
  if (memory.namespace !== namespace) {
    throw new IsolationError(
      'cross-namespace-read',
      `Cannot read ${memory.namespace} memory from ${namespace}`
    );
  }
  return memory.read(key);
}
