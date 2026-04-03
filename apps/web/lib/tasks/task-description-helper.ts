export interface TaskDescriptionHelperLink {
  readonly label: string;
  readonly href: string;
}

export interface TaskDescriptionHelperPayload {
  readonly title: string;
  readonly intro: readonly string[];
  readonly bullets?: readonly string[];
  readonly links?: readonly TaskDescriptionHelperLink[];
  readonly footer?: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isLinkArray(value: unknown): value is TaskDescriptionHelperLink[] {
  return (
    Array.isArray(value) &&
    value.every(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }

      const record = item as Record<string, unknown>;
      return (
        typeof record.label === 'string' && typeof record.href === 'string'
      );
    })
  );
}

export function readTaskDescriptionHelper(
  metadata: Record<string, unknown> | null | undefined
): TaskDescriptionHelperPayload | null {
  const rawHelper = metadata?.descriptionHelper;
  if (!rawHelper || typeof rawHelper !== 'object' || Array.isArray(rawHelper)) {
    return null;
  }

  const helper = rawHelper as Record<string, unknown>;
  if (typeof helper.title !== 'string' || !isStringArray(helper.intro)) {
    return null;
  }

  if (
    helper.bullets !== undefined &&
    helper.bullets !== null &&
    !isStringArray(helper.bullets)
  ) {
    return null;
  }

  if (
    helper.links !== undefined &&
    helper.links !== null &&
    !isLinkArray(helper.links)
  ) {
    return null;
  }

  if (
    helper.footer !== undefined &&
    helper.footer !== null &&
    typeof helper.footer !== 'string'
  ) {
    return null;
  }

  return {
    title: helper.title,
    intro: helper.intro,
    bullets: helper.bullets ?? undefined,
    links: helper.links ?? undefined,
    footer: helper.footer ?? undefined,
  };
}
