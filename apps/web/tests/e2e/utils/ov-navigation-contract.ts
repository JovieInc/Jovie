export interface RawNavigationNode {
  readonly rootIndex: number;
  readonly nodeIndex: number;
  readonly tag: string;
  readonly role: string | null;
  readonly text: string | null;
  readonly href: string | null;
  readonly type: string | null;
  readonly classes: readonly string[];
  readonly aria: Readonly<Record<string, string>>;
}

export interface RawNavigationStyleInvariant {
  readonly rootIndex: number;
  readonly nodeIndex: number;
  readonly styles: Readonly<Record<string, string>>;
}

export interface RawNavigationAccessibilityItem {
  readonly role: string;
  readonly name: string | null;
  readonly href: string | null;
  readonly current: string | null;
}

export interface RawNavigationContract {
  readonly nodes: readonly RawNavigationNode[];
  readonly styleInvariants: readonly RawNavigationStyleInvariant[];
  readonly accessibility: readonly RawNavigationAccessibilityItem[];
}

export const NAVIGATION_STYLE_PROBE_SELECTOR = 'a[href], button';

function normalizeWhitespace(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function sortedRecord(
  record: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, value.replace(/\s+/g, ' ').trim()] as const)
      .toSorted(([left], [right]) => left.localeCompare(right))
  );
}

/**
 * Compares the navigation contract users and assistive technology receive,
 * without depending on browser-specific outerHTML CSS serialization.
 */
export function normalizeNavigationContract(raw: RawNavigationContract) {
  return {
    nodes: raw.nodes.map(node => ({
      ...node,
      text: normalizeWhitespace(node.text),
      classes: [...new Set(node.classes)].toSorted(),
      aria: sortedRecord(node.aria),
    })),
    styleInvariants: raw.styleInvariants.map(invariant => ({
      ...invariant,
      styles: sortedRecord(invariant.styles),
    })),
    accessibility: raw.accessibility.map(item => ({
      ...item,
      name: normalizeWhitespace(item.name),
    })),
  };
}
