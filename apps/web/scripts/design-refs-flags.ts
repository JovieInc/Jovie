export interface Flags {
  readonly positional: string[];
  readonly values: Map<string, string>;
  readonly switches: Set<string>;
}

export function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {
    positional: [],
    values: new Map(),
    switches: new Set(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      flags.positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split('=', 2);
    const next = argv[index + 1];
    if (inline !== undefined) flags.values.set(key, inline);
    else if (next !== undefined && !next.startsWith('--')) {
      flags.values.set(key, next);
      index += 1;
    } else flags.switches.add(key);
  }
  return flags;
}

export function list(flags: Flags, key: string): string[] {
  return (flags.values.get(key) ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}
