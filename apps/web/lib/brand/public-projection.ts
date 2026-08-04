const PUBLIC_VALUE = Symbol('public-brand-value');

type PublicProjectionSchema =
  | typeof PUBLIC_VALUE
  | { readonly [key: string]: PublicProjectionSchema }
  | readonly [PublicProjectionSchema];

const PUBLIC_STRING_LIST = [PUBLIC_VALUE] as const;

const PUBLIC_MEDIA_PROJECTION_SCHEMA = {
  url: PUBLIC_VALUE,
  alt: PUBLIC_VALUE,
  provenance_status: PUBLIC_VALUE,
  rights_status: PUBLIC_VALUE,
} as const satisfies PublicProjectionSchema;

/**
 * Runtime authority for the public Brand System projection.
 *
 * This is intentionally an allowlist, not a list of sensitive words. A new
 * canonical field remains private until it is explicitly reviewed and added
 * here, even when its name does not look sensitive. Values still come from the
 * canonical design-system sources; this schema governs only what may cross the
 * public serialization boundary.
 */
const PUBLIC_BRAND_PROJECTION_SCHEMA = {
  schema_version: PUBLIC_VALUE,
  name: PUBLIC_VALUE,
  version: PUBLIC_VALUE,
  released_at: PUBLIC_VALUE,
  source_digest: PUBLIC_VALUE,
  sources: [
    {
      id: PUBLIC_VALUE,
      sha256: PUBLIC_VALUE,
    },
  ],
  sections: PUBLIC_STRING_LIST,
  consumers: [
    {
      name: PUBLIC_VALUE,
      relationship: PUBLIC_VALUE,
    },
  ],
  tokens: [
    {
      name: PUBLIC_VALUE,
      value: PUBLIC_VALUE,
    },
  ],
  semantic_tokens: {
    accent: {
      base: PUBLIC_VALUE,
      hover: PUBLIC_VALUE,
      active: PUBLIC_VALUE,
      subtle: PUBLIC_VALUE,
      foreground: PUBLIC_VALUE,
    },
    borders: {
      subtle: PUBLIC_VALUE,
      default: PUBLIC_VALUE,
      strong: PUBLIC_VALUE,
      focus: PUBLIC_VALUE,
    },
    radii: {
      none: PUBLIC_VALUE,
      xs: PUBLIC_VALUE,
      sm: PUBLIC_VALUE,
      md: PUBLIC_VALUE,
      default: PUBLIC_VALUE,
      lg: PUBLIC_VALUE,
      xl: PUBLIC_VALUE,
      '2xl': PUBLIC_VALUE,
      '3xl': PUBLIC_VALUE,
      pill: PUBLIC_VALUE,
      full: PUBLIC_VALUE,
    },
    spacing: {
      0: PUBLIC_VALUE,
      px: PUBLIC_VALUE,
      0.5: PUBLIC_VALUE,
      1: PUBLIC_VALUE,
      1.5: PUBLIC_VALUE,
      2: PUBLIC_VALUE,
      2.5: PUBLIC_VALUE,
      3: PUBLIC_VALUE,
      4: PUBLIC_VALUE,
      5: PUBLIC_VALUE,
      6: PUBLIC_VALUE,
      8: PUBLIC_VALUE,
      10: PUBLIC_VALUE,
      12: PUBLIC_VALUE,
      16: PUBLIC_VALUE,
      20: PUBLIC_VALUE,
      24: PUBLIC_VALUE,
    },
    status: {
      success: {
        base: PUBLIC_VALUE,
        subtle: PUBLIC_VALUE,
        foreground: PUBLIC_VALUE,
      },
      warning: {
        base: PUBLIC_VALUE,
        subtle: PUBLIC_VALUE,
        foreground: PUBLIC_VALUE,
      },
      error: {
        base: PUBLIC_VALUE,
        subtle: PUBLIC_VALUE,
        foreground: PUBLIC_VALUE,
      },
      info: {
        base: PUBLIC_VALUE,
        subtle: PUBLIC_VALUE,
        foreground: PUBLIC_VALUE,
      },
    },
    surfaces: {
      base: PUBLIC_VALUE,
      'surface-0': PUBLIC_VALUE,
      'surface-1': PUBLIC_VALUE,
      'surface-2': PUBLIC_VALUE,
      'surface-3': PUBLIC_VALUE,
      page: PUBLIC_VALUE,
      hover: PUBLIC_VALUE,
      elevated: PUBLIC_VALUE,
      input: PUBLIC_VALUE,
      active: PUBLIC_VALUE,
      button: PUBLIC_VALUE,
      tooltip: PUBLIC_VALUE,
    },
    text: {
      primary: PUBLIC_VALUE,
      secondary: PUBLIC_VALUE,
      tertiary: PUBLIC_VALUE,
      quaternary: PUBLIC_VALUE,
      disabled: PUBLIC_VALUE,
      tooltip: PUBLIC_VALUE,
    },
  },
  typography: {
    fontSans: PUBLIC_VALUE,
    fontBody: PUBLIC_VALUE,
    fontDisplay: PUBLIC_VALUE,
    fontMono: PUBLIC_VALUE,
    fontFeatures: PUBLIC_VALUE,
    roles: {
      display: {
        family: PUBLIC_VALUE,
        token: PUBLIC_VALUE,
        use: PUBLIC_VALUE,
      },
      body: {
        family: PUBLIC_VALUE,
        token: PUBLIC_VALUE,
        use: PUBLIC_VALUE,
      },
      interface: {
        family: PUBLIC_VALUE,
        token: PUBLIC_VALUE,
        use: PUBLIC_VALUE,
      },
    },
    size: {
      '2xs': PUBLIC_VALUE,
      xs: PUBLIC_VALUE,
      app: PUBLIC_VALUE,
      sm: PUBLIC_VALUE,
      base: PUBLIC_VALUE,
      lg: PUBLIC_VALUE,
      xl: PUBLIC_VALUE,
      '2xl': PUBLIC_VALUE,
      '3xl': PUBLIC_VALUE,
      '4xl': PUBLIC_VALUE,
      '5xl': PUBLIC_VALUE,
    },
    weight: {
      normal: PUBLIC_VALUE,
      book: PUBLIC_VALUE,
      medium: PUBLIC_VALUE,
      semibold: PUBLIC_VALUE,
      bold: PUBLIC_VALUE,
      heavy: PUBLIC_VALUE,
    },
    leading: {
      none: PUBLIC_VALUE,
      tight: PUBLIC_VALUE,
      snug: PUBLIC_VALUE,
      normal: PUBLIC_VALUE,
      relaxed: PUBLIC_VALUE,
    },
    tracking: {
      tighter: PUBLIC_VALUE,
      tight: PUBLIC_VALUE,
      normal: PUBLIC_VALUE,
      wide: PUBLIC_VALUE,
    },
  },
  density_modes: [
    {
      name: PUBLIC_VALUE,
      summary: PUBLIC_VALUE,
    },
  ],
  components: {
    catalog: PUBLIC_STRING_LIST,
    button: {
      variants: PUBLIC_STRING_LIST,
      sizes: PUBLIC_STRING_LIST,
    },
    access: PUBLIC_VALUE,
  },
  approved_examples: [
    {
      label: PUBLIC_VALUE,
      url: PUBLIC_VALUE,
    },
  ],
  composition_spec_version: PUBLIC_VALUE,
  assets: [
    {
      label: PUBLIC_VALUE,
      file: PUBLIC_VALUE,
      href: PUBLIC_VALUE,
      kind: PUBLIC_VALUE,
      bytes: PUBLIC_VALUE,
      sha256: PUBLIC_VALUE,
    },
  ],
  media: {
    published: [PUBLIC_MEDIA_PROJECTION_SCHEMA],
    public_fields: PUBLIC_STRING_LIST,
    policy: {
      default: PUBLIC_VALUE,
      alt: PUBLIC_VALUE,
      provenance_status: PUBLIC_VALUE,
      rights_status: PUBLIC_VALUE,
      analytics: PUBLIC_VALUE,
    },
  },
  motion: {
    delight_optional: PUBLIC_VALUE,
    simultaneous_active_max: PUBLIC_VALUE,
    simultaneous_scope: PUBLIC_VALUE,
    limits: [
      {
        content_sections_max: PUBLIC_VALUE,
        max_dominant_delights: PUBLIC_VALUE,
        requires_named_exception_and_complete_receipts: PUBLIC_VALUE,
      },
    ],
    section_counting: {
      definition: PUBLIC_VALUE,
      excluded: PUBLIC_STRING_LIST,
      distinct_content_sections: PUBLIC_STRING_LIST,
    },
    progression: PUBLIC_STRING_LIST,
    default_tier: PUBLIC_VALUE,
    editorial_may_be_deferred: PUBLIC_VALUE,
    video_may_be_deferred: PUBLIC_VALUE,
    static_tier_may_ship_independently: PUBLIC_VALUE,
    intentionality_fields: PUBLIC_STRING_LIST,
    reject_when: PUBLIC_STRING_LIST,
    definitions: {
      functional_transition: PUBLIC_VALUE,
      dominant_delight: PUBLIC_VALUE,
    },
    safeguards: {
      reduced_motion_fallback: PUBLIC_VALUE,
      static_fallback: PUBLIC_VALUE,
      scroll_hijacking_allowed: PUBLIC_VALUE,
      parallax_regression_proof: PUBLIC_VALUE,
    },
  },
  voice: PUBLIC_STRING_LIST,
  guidance: {
    accessibility: PUBLIC_STRING_LIST,
    icons: PUBLIC_STRING_LIST,
    imagery: PUBLIC_STRING_LIST,
    logos: PUBLIC_STRING_LIST,
    screenshots: PUBLIC_STRING_LIST,
  },
  do_dont: [
    {
      do: PUBLIC_VALUE,
      dont: PUBLIC_VALUE,
    },
  ],
  exceptions: [
    {
      id: PUBLIC_VALUE,
      introducedIn: PUBLIC_VALUE,
      name: PUBLIC_VALUE,
      justification: PUBLIC_VALUE,
      founderApproved: PUBLIC_VALUE,
    },
  ],
  changelog: [
    {
      version: PUBLIC_VALUE,
      date: PUBLIC_VALUE,
      summary: PUBLIC_VALUE,
    },
  ],
} as const satisfies PublicProjectionSchema;

const PRIVATE_STRING_PATTERNS = [
  /\/Users\//,
  /(?:^|\s)(?:apps\/web|packages\/|canon\/)/,
  /\bJOV-\d+\b/,
] as const;

function findProjectionViolations(
  value: unknown,
  schema: PublicProjectionSchema,
  path = '$',
  findings: string[] = []
): readonly string[] {
  if (schema === PUBLIC_VALUE) {
    if (value !== null && typeof value === 'object') {
      findings.push(`${path} must be a public scalar value`);
      return findings;
    }
    if (
      typeof value === 'string' &&
      PRIVATE_STRING_PATTERNS.some(pattern => pattern.test(value))
    ) {
      findings.push(`${path} contains private source or work-tracking detail`);
    }
    return findings;
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) {
      findings.push(`${path} must be a public array`);
      return findings;
    }
    value.forEach((item, index) => {
      findProjectionViolations(item, schema[0], `${path}[${index}]`, findings);
    });
    return findings;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    findings.push(`${path} must be a public object`);
    return findings;
  }

  const objectSchema = schema as {
    readonly [key: string]: PublicProjectionSchema;
  };
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    const nestedSchema = objectSchema[key];
    if (!nestedSchema) {
      findings.push(`${nestedPath} is not in the public projection schema`);
      continue;
    }
    findProjectionViolations(nested, nestedSchema, nestedPath, findings);
  }
  return findings;
}

function assertMatchesPublicProjection(
  value: unknown,
  schema: PublicProjectionSchema,
  label: string
): void {
  const findings = findProjectionViolations(value, schema);
  if (findings.length > 0) {
    throw new Error(
      `${label} rejected private or unreviewed fields:\n${findings
        .map(finding => `- ${finding}`)
        .join('\n')}`
    );
  }
}

export function assertPublicSafeProjection(value: unknown): void {
  assertMatchesPublicProjection(
    value,
    PUBLIC_BRAND_PROJECTION_SCHEMA,
    'Public Brand System projection'
  );
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
  assertMatchesPublicProjection(
    value,
    PUBLIC_MEDIA_PROJECTION_SCHEMA,
    'Public media projection'
  );
  if (!value.alt.trim()) {
    throw new Error(
      'Public media alt text must be human-reviewed and non-empty.'
    );
  }
}
