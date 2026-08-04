const ALLOWED_PUBLIC_MEDIA_KEYS = new Set([
  'url',
  'alt',
  'provenance_status',
  'rights_status',
]);

const PRIVATE_KEY_PARTS = new Set([
  'adult',
  'age',
  'audience',
  'consent',
  'demographic',
  'gender',
  'internal',
  'license',
  'licensing',
  'person',
  'segment',
  'setting',
  'style',
  'subject',
  'target',
  'targeting',
  'trait',
  'variant',
]);

const PRIVATE_STRING_PATTERNS = [
  /\/Users\//,
  /(?:^|\s)(?:apps\/web|packages\/|canon\/)/,
  /\bJOV-\d+\b/,
] as const;

function keyParts(key: string): readonly string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function findPrivateProjectionPaths(
  value: unknown,
  path = '$',
  findings: string[] = []
): readonly string[] {
  if (typeof value === 'string') {
    if (PRIVATE_STRING_PATTERNS.some(pattern => pattern.test(value))) {
      findings.push(`${path} contains private source or work-tracking detail`);
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findPrivateProjectionPaths(item, `${path}[${index}]`, findings);
    });
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    const parts = keyParts(key);
    if (
      !ALLOWED_PUBLIC_MEDIA_KEYS.has(key) &&
      parts.some(part => PRIVATE_KEY_PARTS.has(part))
    ) {
      findings.push(`${nestedPath} is private by default`);
      continue;
    }
    findPrivateProjectionPaths(nested, nestedPath, findings);
  }
  return findings;
}

export function assertPublicSafeProjection(value: unknown): void {
  const findings = findPrivateProjectionPaths(value);
  if (findings.length > 0) {
    throw new Error(
      `Public Brand System projection rejected private fields:\n${findings
        .map(finding => `- ${finding}`)
        .join('\n')}`
    );
  }
}

export interface PublicMediaProjection {
  readonly url: string;
  readonly alt: string;
  readonly provenance_status: 'verified' | 'unknown';
  readonly rights_status: 'cleared' | 'withheld';
}

export function assertPublicMediaProjection(
  value: PublicMediaProjection
): void {
  const keys = Object.keys(value);
  if (keys.some(key => !ALLOWED_PUBLIC_MEDIA_KEYS.has(key))) {
    throw new Error(
      'Public media may contain only url, alt, provenance_status, and rights_status.'
    );
  }
  if (!value.alt.trim()) {
    throw new Error(
      'Public media alt text must be human-reviewed and non-empty.'
    );
  }
  assertPublicSafeProjection(value);
}
